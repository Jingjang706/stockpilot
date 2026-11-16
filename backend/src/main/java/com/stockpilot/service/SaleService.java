package com.stockpilot.service;

import com.stockpilot.domain.MovementType;
import com.stockpilot.domain.Payment;
import com.stockpilot.domain.Product;
import com.stockpilot.domain.Role;
import com.stockpilot.domain.Sale;
import com.stockpilot.domain.SaleItem;
import com.stockpilot.domain.SaleStatus;
import com.stockpilot.exception.BadRequestException;
import com.stockpilot.exception.ConflictException;
import com.stockpilot.exception.NotFoundException;
import com.stockpilot.repository.ProductRepository;
import com.stockpilot.repository.SaleRepository;
import com.stockpilot.repository.UserRepository;
import com.stockpilot.security.AppUserDetails;
import com.stockpilot.security.CurrentUser;
import com.stockpilot.service.SaleCalculator.Line;
import com.stockpilot.service.SaleCalculator.Totals;
import com.stockpilot.web.dto.SaleDtos.CartItem;
import com.stockpilot.web.dto.SaleDtos.CheckoutRequest;
import com.stockpilot.web.dto.SaleDtos.SaleResponse;
import com.stockpilot.web.dto.SaleDtos.SaleSummary;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SaleService {
    private static final DateTimeFormatter RECEIPT_DATE = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final SaleRepository saleRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final InventoryService inventoryService;
    private final AuditService auditService;
    private final Clock clock;
    private final ZoneId businessZone;

    /**
     * Processes a POS sale atomically. If any line lacks stock, the whole transaction rolls back:
     * no sale row, no payment and no stock movement survive.
     */
    @Transactional
    public SaleResponse checkout(CheckoutRequest req) {
        AppUserDetails actor = CurrentUser.require();

        // Merge duplicate lines and process products in ascending id order so concurrent
        // sales lock inventory rows in the same order (prevents deadlocks).
        Map<Long, Integer> qtyByProduct = new TreeMap<>();
        for (CartItem item : req.items()) {
            qtyByProduct.merge(item.productId(), item.quantity(), Integer::sum);
        }
        Map<Long, Product> products = productRepository.findAllById(qtyByProduct.keySet()).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        if (products.size() != qtyByProduct.size()) {
            throw new BadRequestException("One or more products in the cart do not exist");
        }

        List<Line> lines = new ArrayList<>();
        for (var entry : qtyByProduct.entrySet()) {
            Product p = products.get(entry.getKey());
            if (!p.isActive()) {
                throw new ConflictException("'" + p.getName() + "' is archived and cannot be sold");
            }
            lines.add(new Line(p.getId(), entry.getValue(), p.getSellingPrice(), p.getCostPrice()));
        }

        Totals totals = SaleCalculator.compute(lines, req.discountAmount());
        if (totals.discount().signum() > 0 && actor.getRole() == Role.CASHIER
                && totals.discount().compareTo(SaleCalculator.maxCashierDiscount(totals.subtotal())) > 0) {
            throw new AccessDeniedException("Discounts above 5% of the subtotal require a manager or admin");
        }

        Sale sale = new Sale();
        sale.setReceiptNumber("SP-" + LocalDate.now(clock.withZone(businessZone)).format(RECEIPT_DATE)
                + "-" + saleRepository.nextReceiptSequence());
        sale.setCashier(userRepository.getReferenceById(actor.getId()));
        sale.setSubtotal(totals.subtotal());
        sale.setDiscountAmount(totals.discount());
        sale.setTotal(totals.total());
        sale.setCogs(totals.cogs());
        for (Line line : lines) {
            Product p = products.get(line.productId());
            SaleItem item = new SaleItem();
            item.setProduct(p);
            item.setProductName(p.getName());
            item.setSku(p.getSku());
            item.setQuantity(line.quantity());
            item.setUnitPrice(line.unitPrice());
            item.setUnitCost(line.unitCost());
            item.setLineTotal(SaleCalculator.lineTotal(line.unitPrice(), line.quantity()));
            sale.addItem(item);
        }
        Payment payment = new Payment();
        payment.setMethod(req.paymentMethod());
        payment.setAmount(totals.total());
        payment.setReference(blankToNull(req.paymentReference()));
        sale.addPayment(payment);
        sale = saleRepository.save(sale);

        for (Line line : lines) {
            inventoryService.applyChange(line.productId(), MovementType.SALE, -line.quantity(), line.unitCost(),
                    null, "SALE", sale.getId());
        }
        auditService.log("SALE_CREATED", "SALE", sale.getId(),
                sale.getReceiptNumber() + " total " + sale.getTotal() + " via " + req.paymentMethod());
        return SaleResponse.from(sale, actor.getRole() != Role.CASHIER);
    }

    @Transactional(readOnly = true)
    public Page<SaleSummary> list(String receipt, SaleStatus status, Instant from, Instant to, Pageable pageable) {
        AppUserDetails actor = CurrentUser.require();
        Long cashierFilter = actor.getRole() == Role.CASHIER ? actor.getId() : null;   // cashiers see only their own sales
        Specification<Sale> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (receipt != null && !receipt.isBlank()) {
                ps.add(cb.like(cb.lower(root.get("receiptNumber")), "%" + receipt.trim().toLowerCase() + "%"));
            }
            if (status != null) ps.add(cb.equal(root.get("status"), status));
            if (from != null) ps.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from));
            if (to != null) ps.add(cb.lessThan(root.get("createdAt"), to));
            if (cashierFilter != null) ps.add(cb.equal(root.get("cashier").get("id"), cashierFilter));
            return cb.and(ps.toArray(new Predicate[0]));
        };
        return saleRepository.findAll(spec, pageable).map(SaleSummary::from);
    }

    @Transactional(readOnly = true)
    public SaleResponse get(Long id) {
        AppUserDetails actor = CurrentUser.require();
        Sale sale = saleRepository.findById(id).orElseThrow(() -> new NotFoundException("Sale", id));
        if (actor.getRole() == Role.CASHIER && !sale.getCashier().getId().equals(actor.getId())) {
            throw new NotFoundException("Sale", id);   // do not reveal other cashiers' sales
        }
        return SaleResponse.from(sale, actor.getRole() != Role.CASHIER);
    }

    /**
     * Voids (same business day only) or refunds (any time) a completed sale in full, returning the
     * goods to stock. Requires a reason; recorded in the audit log. Callers must be MANAGER/ADMIN.
     */
    @Transactional
    public SaleResponse reverse(Long id, SaleStatus target, String reason) {
        if (target == SaleStatus.COMPLETED) {
            throw new BadRequestException("Invalid reversal type");
        }
        AppUserDetails actor = CurrentUser.require();
        Sale sale = saleRepository.findForUpdate(id).orElseThrow(() -> new NotFoundException("Sale", id));
        if (sale.getStatus() != SaleStatus.COMPLETED) {
            throw new ConflictException("Sale " + sale.getReceiptNumber() + " is already " + sale.getStatus().name().toLowerCase());
        }
        if (target == SaleStatus.VOIDED) {
            LocalDate saleDay = sale.getCreatedAt().atZone(businessZone).toLocalDate();
            if (!saleDay.equals(LocalDate.now(clock.withZone(businessZone)))) {
                throw new ConflictException("Sales can only be voided on the day they were made; use a refund instead");
            }
        }
        MovementType movementType = target == SaleStatus.VOIDED ? MovementType.VOID : MovementType.REFUND;
        sale.getItems().stream()
                .sorted(Comparator.comparing(i -> i.getProduct().getId()))
                .forEach(item -> inventoryService.applyChange(item.getProduct().getId(), movementType,
                        item.getQuantity(), item.getUnitCost(), reason.trim(), "SALE", sale.getId()));
        sale.setStatus(target);
        sale.setReversalReason(reason.trim());
        sale.setReversedBy(userRepository.getReferenceById(actor.getId()));
        sale.setReversedAt(Instant.now(clock));
        saleRepository.save(sale);
        auditService.log(target == SaleStatus.VOIDED ? "SALE_VOIDED" : "SALE_REFUNDED", "SALE", sale.getId(),
                sale.getReceiptNumber() + " total " + sale.getTotal() + " - " + reason.trim());
        return SaleResponse.from(sale, true);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
