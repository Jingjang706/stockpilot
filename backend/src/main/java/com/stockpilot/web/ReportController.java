package com.stockpilot.web;

import com.stockpilot.security.Roles;
import com.stockpilot.service.DateRanges;
import com.stockpilot.service.ProductService;
import com.stockpilot.service.ReportService;
import com.stockpilot.web.dto.ProductDtos.ProductResponse;
import com.stockpilot.web.dto.ReportDtos.PurchaseReport;
import com.stockpilot.web.dto.ReportDtos.RevenueOverview;
import com.stockpilot.web.dto.ReportDtos.SalesReport;
import com.stockpilot.web.dto.ReportDtos.TopProduct;
import com.stockpilot.web.dto.ReportDtos.ValuationReport;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

@RestController
@RequestMapping("/api/reports")
@PreAuthorize(Roles.MANAGER_UP)
@RequiredArgsConstructor
public class ReportController {
    private final ReportService reportService;
    private final ProductService productService;
    private final ZoneId businessZone;

    /** grain: day (daily), week (weekly), month (monthly), year (annual). */
    @GetMapping("/sales")
    public SalesReport sales(
            @RequestParam(defaultValue = "day") String grain,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return reportService.sales(grain, from, to);
    }

    @GetMapping("/best-selling")
    public List<TopProduct> bestSelling(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "10") int limit) {
        DateRanges.validate(from, to);
        return reportService.bestSelling(DateRanges.start(from, businessZone),
                DateRanges.endExclusive(to, businessZone), limit);
    }

    @GetMapping("/low-stock")
    public List<ProductResponse> lowStock() {
        return productService.lowStock();
    }

    @GetMapping("/inventory-valuation")
    public ValuationReport inventoryValuation() {
        return reportService.valuation();
    }

    @GetMapping("/purchases")
    public PurchaseReport purchases(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return reportService.purchases(from, to);
    }

    @GetMapping("/revenue-overview")
    public RevenueOverview revenueOverview(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return reportService.revenueOverview(from, to);
    }
}
