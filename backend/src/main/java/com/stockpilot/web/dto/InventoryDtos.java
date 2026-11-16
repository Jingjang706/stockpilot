package com.stockpilot.web.dto;

import com.stockpilot.domain.MovementType;
import com.stockpilot.domain.StockMovement;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;

public final class InventoryDtos {
    private InventoryDtos() {
    }

    /**
     * STOCK_IN / STOCK_OUT take a positive quantity. ADJUSTMENT takes a signed, non-zero quantity
     * (e.g. -3 for damaged goods, +2 for a recount correction).
     */
    public record MovementRequest(
            @NotNull Long productId,
            @NotNull MovementType type,
            @NotNull Integer quantity,
            @NotBlank @Size(max = 255) String reason,
            @DecimalMin("0.00") BigDecimal unitCost) {
    }

    public record MovementResponse(Long id, Long productId, String productName, String sku, MovementType type,
                                   int quantityChange, int quantityAfter, BigDecimal unitCost, String reason,
                                   String referenceType, Long referenceId, String createdBy, Instant createdAt) {
        public static MovementResponse from(StockMovement m) {
            return new MovementResponse(m.getId(), m.getProduct().getId(), m.getProduct().getName(),
                    m.getProduct().getSku(), m.getType(), m.getQuantityChange(), m.getQuantityAfter(),
                    m.getUnitCost(), m.getReason(), m.getReferenceType(), m.getReferenceId(),
                    m.getCreatedBy() == null ? null : m.getCreatedBy().getFullName(), m.getCreatedAt());
        }
    }
}
