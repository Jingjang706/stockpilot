package com.stockpilot.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class DashboardDtos {
    private DashboardDtos() {
    }

    public record DayTotals(long count, BigDecimal revenue) {
    }

    public record InventoryStatus(long inStock, long lowStock, long outOfStock) {
    }

    public record Dashboard(LocalDate from, LocalDate to, long totalProducts, BigDecimal inventoryValue,
                            DayTotals salesToday, DayTotals monthToDate, long lowStockCount,
                            List<ProductDtos.ProductResponse> lowStock,
                            List<SaleDtos.SaleSummary> recentTransactions,
                            List<ReportDtos.SalesBucket> salesTrend,
                            List<ReportDtos.TopProduct> topProducts,
                            InventoryStatus inventoryStatus, ReportDtos.Totals periodTotals) {
    }
}
