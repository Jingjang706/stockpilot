package com.stockpilot.web.dto;

import com.stockpilot.domain.Purchase;
import com.stockpilot.domain.PurchaseItem;
import com.stockpilot.domain.PurchaseStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class PurchaseDtos {
    private PurchaseDtos() {
    }

    public record PurchaseItemRequest(@NotNull Long productId, @NotNull @Min(1) @Max(1000000) Integer quantity,
                                      @NotNull @DecimalMin("0.00") BigDecimal unitCost) {
    }

    public record CreatePurchaseRequest(@NotNull Long supplierId, @Size(max = 500) String notes,
                                        @NotEmpty @Valid List<PurchaseItemRequest> items) {
    }

    public record PurchaseItemResponse(Long productId, String productName, String sku, int quantity,
                                       BigDecimal unitCost, BigDecimal lineTotal) {
        public static PurchaseItemResponse from(PurchaseItem i) {
            return new PurchaseItemResponse(i.getProduct().getId(), i.getProduct().getName(), i.getProduct().getSku(),
                    i.getQuantity(), i.getUnitCost(),
                    i.getUnitCost().multiply(BigDecimal.valueOf(i.getQuantity())).setScale(2, java.math.RoundingMode.HALF_UP));
        }
    }

    public record PurchaseResponse(Long id, String poNumber, Long supplierId, String supplierName,
                                   PurchaseStatus status, String notes, BigDecimal totalCost, String createdBy,
                                   String approvedBy, String receivedBy, Instant receivedAt, Instant createdAt,
                                   List<PurchaseItemResponse> items) {
        public static PurchaseResponse from(Purchase p) {
            return new PurchaseResponse(p.getId(), p.getPoNumber(), p.getSupplier().getId(), p.getSupplier().getName(),
                    p.getStatus(), p.getNotes(), p.getTotalCost(), p.getCreatedBy().getFullName(),
                    p.getApprovedBy() == null ? null : p.getApprovedBy().getFullName(),
                    p.getReceivedBy() == null ? null : p.getReceivedBy().getFullName(),
                    p.getReceivedAt(), p.getCreatedAt(),
                    p.getItems().stream().map(PurchaseItemResponse::from).toList());
        }
    }
}
