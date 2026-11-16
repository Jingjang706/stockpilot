package com.stockpilot.web;

import com.stockpilot.domain.PurchaseStatus;
import com.stockpilot.security.Roles;
import com.stockpilot.service.DateRanges;
import com.stockpilot.service.PurchaseService;
import com.stockpilot.web.dto.PurchaseDtos.CreatePurchaseRequest;
import com.stockpilot.web.dto.PurchaseDtos.PurchaseResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;

@RestController
@RequestMapping("/api/purchases")
@PreAuthorize(Roles.MANAGER_UP)
@RequiredArgsConstructor
public class PurchaseController {
    private final PurchaseService purchaseService;
    private final ZoneId businessZone;

    @GetMapping
    public Page<PurchaseResponse> list(
            @RequestParam(required = false) PurchaseStatus status,
            @RequestParam(required = false) Long supplierId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        DateRanges.validate(from, to);
        return purchaseService.list(status, supplierId, DateRanges.start(from, businessZone),
                DateRanges.endExclusive(to, businessZone), pageable);
    }

    @GetMapping("/{id}")
    public PurchaseResponse get(@PathVariable Long id) {
        return purchaseService.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PurchaseResponse create(@Valid @RequestBody CreatePurchaseRequest request) {
        return purchaseService.create(request);
    }

    @PostMapping("/{id}/approve")
    public PurchaseResponse approve(@PathVariable Long id) {
        return purchaseService.approve(id);
    }

    @PostMapping("/{id}/receive")
    public PurchaseResponse receive(@PathVariable Long id) {
        return purchaseService.receive(id);
    }

    @PostMapping("/{id}/cancel")
    public PurchaseResponse cancel(@PathVariable Long id) {
        return purchaseService.cancel(id);
    }
}
