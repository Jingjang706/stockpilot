package com.stockpilot.web.dto;

import com.stockpilot.domain.Category;
import com.stockpilot.domain.Product;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;

public final class ProductDtos {
    private ProductDtos() {
    }

    public record ProductRequest(
            @NotBlank @Size(max = 50) String sku,
            @Size(max = 60) String barcode,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 5000) String description,
            Long categoryId,
            Long supplierId,
            @NotNull @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal costPrice,
            @NotNull @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal sellingPrice,
            @Min(0) Integer minStock,
            @Size(max = 500) String imageUrl,
            @Min(0) Integer initialStock) {
    }

    public record ProductResponse(Long id, String sku, String barcode, String name, String description,
                                  Long categoryId, String categoryName, Long supplierId, String supplierName,
                                  BigDecimal costPrice, BigDecimal sellingPrice, int quantity, int minStock,
                                  String stockStatus, String imageUrl, boolean active,
                                  Instant createdAt, Instant updatedAt) {

        public static String statusOf(int quantity, int minStock) {
            if (quantity <= 0) return "OUT_OF_STOCK";
            if (quantity <= minStock) return "LOW_STOCK";
            return "IN_STOCK";
        }

        /** costPrice is withheld (null) from cashiers. */
        public static ProductResponse from(Product p, int quantity, boolean includeCost) {
            return new ProductResponse(p.getId(), p.getSku(), p.getBarcode(), p.getName(), p.getDescription(),
                    p.getCategory() == null ? null : p.getCategory().getId(),
                    p.getCategory() == null ? null : p.getCategory().getName(),
                    p.getSupplier() == null ? null : p.getSupplier().getId(),
                    p.getSupplier() == null ? null : p.getSupplier().getName(),
                    includeCost ? p.getCostPrice() : null, p.getSellingPrice(), quantity, p.getMinStock(),
                    statusOf(quantity, p.getMinStock()), p.getImageUrl(), p.isActive(),
                    p.getCreatedAt(), p.getUpdatedAt());
        }
    }

    public record CategoryRequest(@NotBlank @Size(max = 80) String name, @Size(max = 255) String description) {
    }

    public record CategoryResponse(Long id, String name, String description) {
        public static CategoryResponse from(Category c) {
            return new CategoryResponse(c.getId(), c.getName(), c.getDescription());
        }
    }
}
