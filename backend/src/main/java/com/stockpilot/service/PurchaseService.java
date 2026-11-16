package com.stockpilot.service;

import com.stockpilot.domain.MovementType;
import com.stockpilot.domain.Product;
import com.stockpilot.domain.Purchase;
import com.stockpilot.domain.PurchaseItem;
import com.stockpilot.domain.PurchaseStatus;
import com.stockpilot.domain.Supplier;
import com.stockpilot.exception.BadRequestException;
import com.stockpilot.exception.ConflictException;
import com.stockpilot.exception.NotFoundException;
import com.stockpilot.repository.ProductRepository;
import com.stockpilot.repository.PurchaseRepository;
import com.stockpilot.repository.SupplierRepository;
import com.stockpilot.repository.UserRepository;
import com.stockpilot.security.AppUserDetails;
import com.stockpilot.security.CurrentUser;
import com.stockpilot.web.dto.PurchaseDtos.CreatePurchaseRequest;
import com.stockpilot.web.dto.PurchaseDtos.PurchaseItemRequest;
import com.stockpilot.web.dto.PurchaseDtos.PurchaseResponse;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Purchase order lifecycle: PENDING -> APPROVED -> RECEIVED, with CANCELLED possible before receipt.
 * Receiving is all-or-nothing (partial receipts are a documented future improvement).
 */
@Service
@RequiredArgsConstructor
public class PurchaseService {
    private final PurchaseRepository purchaseRepository;
    private final SupplierRepository supplierRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final InventoryService inventoryService;
    private final AuditService auditService;
    private final Clock clock;

    @Transactional
    public PurchaseResponse create(CreatePurchaseRequest req) {
        AppUserDetails actor = CurrentUser.require();
        Supplier supplier = supplierRepository.findById(req.supplierId())
                .orElseThrow(() -> new NotFoundException("Supplier", req.supplierId()));
        if (!supplier.isActive()) {
            throw new ConflictException("Supplier is inactive");
        }
        Purchase purchase = new Purchase();
        purchase.setSupplier(supplier);
        purchase.setNotes(req.notes() == null || req.notes().isBlank() ? null : req.notes().trim());
        purchase.setCreatedBy(userRepository.getReferenceById(actor.getId()));
        purchase.setPoNumber("PO-" + purchaseRepository.nextPoSequence());

        Set<Long> seen = new HashSet<>();
        BigDecimal total = BigDecimal.ZERO;
        for (PurchaseItemRequest line : req.items()) {
            if (!seen.add(line.productId())) {
                throw new BadRequestException("Each product may appear only once per purchase order");
            }
            Product product = productRepository.findById(line.productId())
                    .orElseThrow(() -> new NotFoundException("Product", line.productId()));
            PurchaseItem item = new PurchaseItem();
            item.setProduct(product);
            item.setQuantity(line.quantity());
            item.setUnitCost(SaleCalculator.money(line.unitCost()));
            purchase.addItem(item);
            total = total.add(SaleCalculator.lineTotal(item.getUnitCost(), item.getQuantity()));
        }
        purchase.setTotalCost(SaleCalculator.money(total));
        purchase = purchaseRepository.save(purchase);
        auditService.log("PURCHASE_CREATED", "PURCHASE", purchase.getId(),
                purchase.getPoNumber() + " from " + supplier.getName() + " total " + purchase.getTotalCost());
        return PurchaseResponse.from(purchase);
    }

    @Transactional
    public PurchaseResponse approve(Long id) {
        AppUserDetails actor = CurrentUser.require();
        Purchase p = lock(id);
        requireStatus(p, PurchaseStatus.PENDING, "approved");
        p.setStatus(PurchaseStatus.APPROVED);
        p.setApprovedBy(userRepository.getReferenceById(actor.getId()));
        auditService.log("PURCHASE_APPROVED", "PURCHASE", id, p.getPoNumber());
        return PurchaseResponse.from(purchaseRepository.save(p));
    }

    /** Books the goods into stock, one PURCHASE_RECEIPT movement per line, and updates last-known cost. */
    @Transactional
    public PurchaseResponse receive(Long id) {
        AppUserDetails actor = CurrentUser.require();
        Purchase p = lock(id);
        requireStatus(p, PurchaseStatus.APPROVED, "received");
        p.getItems().stream()
                .sorted((a, b) -> a.getProduct().getId().compareTo(b.getProduct().getId()))
                .forEach(item -> {
                    inventoryService.applyChange(item.getProduct().getId(), MovementType.PURCHASE_RECEIPT,
                            item.getQuantity(), item.getUnitCost(), "Received " + p.getPoNumber(), "PURCHASE", p.getId());
                    item.getProduct().setCostPrice(item.getUnitCost());   // last-cost valuation for future sales
                    productRepository.save(item.getProduct());
                });
        p.setStatus(PurchaseStatus.RECEIVED);
        p.setReceivedBy(userRepository.getReferenceById(actor.getId()));
        p.setReceivedAt(Instant.now(clock));
        auditService.log("PURCHASE_RECEIVED", "PURCHASE", id, p.getPoNumber() + " total " + p.getTotalCost());
        return PurchaseResponse.from(purchaseRepository.save(p));
    }

    @Transactional
    public PurchaseResponse cancel(Long id) {
        Purchase p = lock(id);
        if (p.getStatus() != PurchaseStatus.PENDING && p.getStatus() != PurchaseStatus.APPROVED) {
            throw new ConflictException("Only pending or approved orders can be cancelled");
        }
        p.setStatus(PurchaseStatus.CANCELLED);
        auditService.log("PURCHASE_CANCELLED", "PURCHASE", id, p.getPoNumber());
        return PurchaseResponse.from(purchaseRepository.save(p));
    }

    @Transactional(readOnly = true)
    public PurchaseResponse get(Long id) {
        return PurchaseResponse.from(purchaseRepository.findById(id).orElseThrow(() -> new NotFoundException("Purchase", id)));
    }

    @Transactional(readOnly = true)
    public Page<PurchaseResponse> list(PurchaseStatus status, Long supplierId, Instant from, Instant to, Pageable pageable) {
        return purchaseRepository.findAll(filter(status, supplierId, from, to), pageable).map(PurchaseResponse::from);
    }

    @Transactional(readOnly = true)
    public List<PurchaseResponse> listAll(Instant from, Instant to) {
        return purchaseRepository.findAll(filter(null, null, from, to),
                org.springframework.data.domain.Sort.by("createdAt").descending()).stream().map(PurchaseResponse::from).toList();
    }

    private Purchase lock(Long id) {
        return purchaseRepository.findForUpdate(id).orElseThrow(() -> new NotFoundException("Purchase", id));
    }

    private static void requireStatus(Purchase p, PurchaseStatus expected, String verb) {
        if (p.getStatus() != expected) {
            throw new ConflictException("Purchase " + p.getPoNumber() + " is " + p.getStatus().name().toLowerCase()
                    + " and cannot be " + verb + (expected == PurchaseStatus.APPROVED ? " (it must be approved first)" : ""));
        }
    }

    private static Specification<Purchase> filter(PurchaseStatus status, Long supplierId, Instant from, Instant to) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (status != null) ps.add(cb.equal(root.get("status"), status));
            if (supplierId != null) ps.add(cb.equal(root.get("supplier").get("id"), supplierId));
            if (from != null) ps.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from));
            if (to != null) ps.add(cb.lessThan(root.get("createdAt"), to));
            return cb.and(ps.toArray(new Predicate[0]));
        };
    }
}
