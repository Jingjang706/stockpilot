package com.stockpilot.service;

import com.stockpilot.domain.Inventory;
import com.stockpilot.domain.MovementType;
import com.stockpilot.domain.Product;
import com.stockpilot.domain.StockMovement;
import com.stockpilot.exception.BadRequestException;
import com.stockpilot.exception.InsufficientStockException;
import com.stockpilot.exception.NotFoundException;
import com.stockpilot.repository.InventoryRepository;
import com.stockpilot.repository.ProductRepository;
import com.stockpilot.repository.StockMovementRepository;
import com.stockpilot.repository.UserRepository;
import com.stockpilot.security.CurrentUser;
import com.stockpilot.web.dto.InventoryDtos.MovementRequest;
import com.stockpilot.web.dto.InventoryDtos.MovementResponse;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * The single place where stock levels change. Every change takes a row lock on the inventory row,
 * refuses to go below zero, and writes an immutable stock_movements record in the same transaction.
 */
@Service
@RequiredArgsConstructor
public class InventoryService {
    private static final Set<MovementType> MANUAL_TYPES =
            EnumSet.of(MovementType.STOCK_IN, MovementType.STOCK_OUT, MovementType.ADJUSTMENT);

    private final InventoryRepository inventoryRepository;
    private final StockMovementRepository movementRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;

    @Transactional
    public StockMovement applyChange(Long productId, MovementType type, int change, BigDecimal unitCost,
                                     String reason, String referenceType, Long referenceId) {
        if (change == 0) {
            throw new BadRequestException("Quantity change cannot be zero");
        }
        Inventory inventory = inventoryRepository.findForUpdate(productId)
                .orElseThrow(() -> new NotFoundException("Inventory for product", productId));
        int after = inventory.getQuantity() + change;
        if (after < 0) {
            String name = productRepository.findById(productId).map(Product::getName).orElse("#" + productId);
            throw new InsufficientStockException(name, inventory.getQuantity(), -change);
        }
        inventory.setQuantity(after);
        inventoryRepository.save(inventory);

        StockMovement movement = new StockMovement();
        movement.setProduct(productRepository.getReferenceById(productId));
        movement.setType(type);
        movement.setQuantityChange(change);
        movement.setQuantityAfter(after);
        movement.setUnitCost(unitCost);
        movement.setReason(reason);
        movement.setReferenceType(referenceType);
        movement.setReferenceId(referenceId);
        CurrentUser.get().ifPresent(u -> movement.setCreatedBy(userRepository.getReferenceById(u.getId())));
        return movementRepository.save(movement);
    }

    /** Manual stock-in, stock-out or adjustment entered by a manager/admin. */
    @Transactional
    public MovementResponse recordManual(MovementRequest request) {
        if (!MANUAL_TYPES.contains(request.type())) {
            throw new BadRequestException("Only STOCK_IN, STOCK_OUT and ADJUSTMENT can be entered manually");
        }
        int qty = request.quantity();
        int change;
        switch (request.type()) {
            case STOCK_IN -> {
                if (qty <= 0) throw new BadRequestException("Stock-in quantity must be positive");
                change = qty;
            }
            case STOCK_OUT -> {
                if (qty <= 0) throw new BadRequestException("Stock-out quantity must be positive");
                change = -qty;
            }
            default -> {
                if (qty == 0) throw new BadRequestException("Adjustment quantity cannot be zero");
                change = qty;
            }
        }
        StockMovement m = applyChange(request.productId(), request.type(), change, request.unitCost(),
                request.reason().trim(), "MANUAL", null);
        auditService.log("STOCK_ADJUSTED", "PRODUCT", request.productId(),
                request.type() + " " + (change > 0 ? "+" : "") + change + " - " + request.reason().trim());
        return MovementResponse.from(m);
    }

    @Transactional(readOnly = true)
    public Page<MovementResponse> movements(Long productId, MovementType type, Instant from, Instant to,
                                            Pageable pageable) {
        Specification<StockMovement> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (productId != null) ps.add(cb.equal(root.get("product").get("id"), productId));
            if (type != null) ps.add(cb.equal(root.get("type"), type));
            if (from != null) ps.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from));
            if (to != null) ps.add(cb.lessThan(root.get("createdAt"), to));
            return cb.and(ps.toArray(new Predicate[0]));
        };
        return movementRepository.findAll(spec, pageable).map(MovementResponse::from);
    }
}
