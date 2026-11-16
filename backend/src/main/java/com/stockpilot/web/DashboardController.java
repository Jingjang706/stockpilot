package com.stockpilot.web;

import com.stockpilot.security.Roles;
import com.stockpilot.service.DashboardService;
import com.stockpilot.web.dto.DashboardDtos.Dashboard;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/dashboard")
@PreAuthorize(Roles.MANAGER_UP)
@RequiredArgsConstructor
public class DashboardController {
    private final DashboardService dashboardService;

    /** from/to default to the last 30 days and drive the trend chart, top products and period totals. */
    @GetMapping
    public Dashboard dashboard(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return dashboardService.build(from, to);
    }
}
