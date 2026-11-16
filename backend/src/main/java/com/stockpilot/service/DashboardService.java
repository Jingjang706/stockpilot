package com.stockpilot.service;

import com.stockpilot.domain.SaleStatus;
import com.stockpilot.repository.InventoryRepository;
import com.stockpilot.repository.ProductRepository;
import com.stockpilot.repository.SaleRepository;
import com.stockpilot.web.dto.DashboardDtos.Dashboard;
import com.stockpilot.web.dto.DashboardDtos.DayTotals;
import com.stockpilot.web.dto.DashboardDtos.InventoryStatus;
import com.stockpilot.web.dto.ProductDtos.ProductResponse;
import com.stockpilot.web.dto.ReportDtos.SalesBucket;
import com.stockpilot.web.dto.ReportDtos.Totals;
import com.stockpilot.web.dto.SaleDtos.SaleSummary;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class DashboardService {
    private final ProductRepository productRepository;
    private final InventoryRepository inventoryRepository;
    private final SaleRepository saleRepository;
    private final ProductService productService;
    private final ReportService reportService;
    private final Clock clock;
    private final ZoneId businessZone;

    @Transactional(readOnly = true)
    public Dashboard build(LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now(clock.withZone(businessZone));
        LocalDate end = to == null ? today : to;
        LocalDate start = from == null ? end.minusDays(29) : from;
        DateRanges.validate(start, end);

        Instant fromInstant = DateRanges.start(start, businessZone);
        Instant toInstant = DateRanges.endExclusive(end, businessZone);

        Totals todayTotals = reportService.totals(SaleStatus.COMPLETED,
                DateRanges.start(today, businessZone), DateRanges.endExclusive(today, businessZone));
        Totals monthTotals = reportService.totals(SaleStatus.COMPLETED,
                DateRanges.start(today.withDayOfMonth(1), businessZone), DateRanges.endExclusive(today, businessZone));

        List<ProductResponse> lowStock = productService.lowStock();
        BigDecimal inventoryValue = inventoryRepository.totalCostValue();

        return new Dashboard(start, end,
                productRepository.countByActiveTrue(),
                inventoryValue == null ? BigDecimal.ZERO.setScale(2) : SaleCalculator.money(inventoryValue),
                new DayTotals(todayTotals.count(), todayTotals.revenue()),
                new DayTotals(monthTotals.count(), monthTotals.revenue()),
                lowStock.size(),
                lowStock.stream().limit(8).toList(),
                saleRepository.findTop10ByOrderByCreatedAtDesc().stream().map(SaleSummary::from).toList(),
                fillDays(reportService.salesBuckets("day", fromInstant, toInstant), start, end),
                reportService.bestSelling(fromInstant, toInstant, 5),
                new InventoryStatus(inventoryRepository.countHealthy(), inventoryRepository.countLowStock(),
                        inventoryRepository.countOutOfStock()),
                reportService.totals(SaleStatus.COMPLETED, fromInstant, toInstant));
    }

    /** Adds zero-value buckets for days with no sales so charts show a continuous axis. */
    private static List<SalesBucket> fillDays(List<SalesBucket> buckets, LocalDate from, LocalDate to) {
        Map<String, SalesBucket> byDay = new HashMap<>();
        buckets.forEach(b -> byDay.put(b.period(), b));
        List<SalesBucket> filled = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            String key = d.toString();
            filled.add(byDay.getOrDefault(key, new SalesBucket(key, 0, BigDecimal.ZERO.setScale(2),
                    BigDecimal.ZERO.setScale(2), BigDecimal.ZERO.setScale(2))));
        }
        return filled;
    }
}
