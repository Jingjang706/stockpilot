package com.stockpilot.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class ReportDtos {
    private ReportDtos() {
    }

    /** revenue = sum of completed sale totals; cogs = cost of goods sold; grossProfit = revenue - cogs. */
    public record Totals(long count, BigDecimal revenue, BigDecimal cogs, BigDecimal grossProfit) {
    }

    public record SalesBucket(String period, long count, BigDecimal revenue, BigDecimal cogs, BigDecimal grossProfit) {
    }

    public record SalesReport(String grain, LocalDate from, LocalDate to, List<SalesBucket> buckets, Totals totals) {
    }

    public record TopProduct(Long productId, String name, String sku, long unitsSold, BigDecimal revenue) {
    }

    public record ValuationRow(Long productId, String sku, String name, String category, int quantity,
                               BigDecimal unitCost, BigDecimal costValue, BigDecimal retailValue) {
    }

    public record ValuationReport(List<ValuationRow> rows, BigDecimal totalCostValue, BigDecimal totalRetailValue) {
    }

    public record RevenueOverview(LocalDate from, LocalDate to, Totals completed, BigDecimal grossMarginPercent,
                                  long voidedCount, BigDecimal voidedAmount,
                                  long refundedCount, BigDecimal refundedAmount, BigDecimal purchaseSpend) {
    }

    public record PurchaseReport(LocalDate from, LocalDate to, List<PurchaseDtos.PurchaseResponse> purchases,
                                 BigDecimal totalOrdered, BigDecimal totalReceived) {
    }
}
