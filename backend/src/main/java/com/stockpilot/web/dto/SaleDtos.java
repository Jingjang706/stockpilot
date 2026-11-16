package com.stockpilot.web.dto;

import com.stockpilot.domain.Payment;
import com.stockpilot.domain.PaymentMethod;
import com.stockpilot.domain.Sale;
import com.stockpilot.domain.SaleItem;
import com.stockpilot.domain.SaleStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class SaleDtos {
    private SaleDtos() {
    }

    public record CartItem(@NotNull Long productId, @NotNull @Min(1) @Max(10000) Integer quantity) {
    }

    public record CheckoutRequest(
            @NotEmpty @Valid List<CartItem> items,
            @DecimalMin("0.00") BigDecimal discountAmount,
            @NotNull PaymentMethod paymentMethod,
            @Size(max = 100) String paymentReference) {
    }

    public record ReasonRequest(@NotBlank @Size(max = 255) String reason) {
    }

    public record SaleItemResponse(Long productId, String productName, String sku, int quantity,
                                   BigDecimal unitPrice, BigDecimal lineTotal) {
        public static SaleItemResponse from(SaleItem i) {
            return new SaleItemResponse(i.getProduct().getId(), i.getProductName(), i.getSku(), i.getQuantity(),
                    i.getUnitPrice(), i.getLineTotal());
        }
    }

    public record PaymentResponse(PaymentMethod method, BigDecimal amount, String reference) {
        public static PaymentResponse from(Payment p) {
            return new PaymentResponse(p.getMethod(), p.getAmount(), p.getReference());
        }
    }

    /** cogs is withheld (null) from cashiers. */
    public record SaleResponse(Long id, String receiptNumber, SaleStatus status, Long cashierId, String cashierName,
                               BigDecimal subtotal, BigDecimal discountAmount, BigDecimal total, BigDecimal cogs,
                               List<SaleItemResponse> items, List<PaymentResponse> payments,
                               String reversalReason, String reversedBy, Instant reversedAt, Instant createdAt) {
        public static SaleResponse from(Sale s, boolean includeCost) {
            return new SaleResponse(s.getId(), s.getReceiptNumber(), s.getStatus(), s.getCashier().getId(),
                    s.getCashier().getFullName(), s.getSubtotal(), s.getDiscountAmount(), s.getTotal(),
                    includeCost ? s.getCogs() : null,
                    s.getItems().stream().map(SaleItemResponse::from).toList(),
                    s.getPayments().stream().map(PaymentResponse::from).toList(),
                    s.getReversalReason(), s.getReversedBy() == null ? null : s.getReversedBy().getFullName(),
                    s.getReversedAt(), s.getCreatedAt());
        }
    }

    public record SaleSummary(Long id, String receiptNumber, SaleStatus status, String cashierName, BigDecimal total,
                              int itemCount, PaymentMethod paymentMethod, Instant createdAt) {
        public static SaleSummary from(Sale s) {
            int units = s.getItems().stream().mapToInt(SaleItem::getQuantity).sum();
            PaymentMethod method = s.getPayments().isEmpty() ? null : s.getPayments().get(0).getMethod();
            return new SaleSummary(s.getId(), s.getReceiptNumber(), s.getStatus(), s.getCashier().getFullName(),
                    s.getTotal(), units, method, s.getCreatedAt());
        }
    }
}
