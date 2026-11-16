package com.stockpilot.web;

import com.stockpilot.domain.SaleStatus;
import com.stockpilot.security.Roles;
import com.stockpilot.service.DateRanges;
import com.stockpilot.service.SaleService;
import com.stockpilot.web.dto.SaleDtos.CheckoutRequest;
import com.stockpilot.web.dto.SaleDtos.ReasonRequest;
import com.stockpilot.web.dto.SaleDtos.SaleResponse;
import com.stockpilot.web.dto.SaleDtos.SaleSummary;
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
@RequestMapping("/api/sales")
@RequiredArgsConstructor
public class SaleController {
    private final SaleService saleService;
    private final ZoneId businessZone;

    /** POS checkout. Atomic: stock, sale and payment are written together or not at all. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Roles.ANY_STAFF)
    public SaleResponse checkout(@Valid @RequestBody CheckoutRequest request) {
        return saleService.checkout(request);
    }

    /** Managers/admins see all sales; cashiers only their own (enforced in the service). */
    @GetMapping
    @PreAuthorize(Roles.ANY_STAFF)
    public Page<SaleSummary> list(
            @RequestParam(required = false) String receipt,
            @RequestParam(required = false) SaleStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        DateRanges.validate(from, to);
        return saleService.list(receipt, status, DateRanges.start(from, businessZone),
                DateRanges.endExclusive(to, businessZone), pageable);
    }

    @GetMapping("/{id}")
    @PreAuthorize(Roles.ANY_STAFF)
    public SaleResponse get(@PathVariable Long id) {
        return saleService.get(id);
    }

    @PostMapping("/{id}/void")
    @PreAuthorize(Roles.MANAGER_UP)
    public SaleResponse voidSale(@PathVariable Long id, @Valid @RequestBody ReasonRequest request) {
        return saleService.reverse(id, SaleStatus.VOIDED, request.reason());
    }

    @PostMapping("/{id}/refund")
    @PreAuthorize(Roles.MANAGER_UP)
    public SaleResponse refund(@PathVariable Long id, @Valid @RequestBody ReasonRequest request) {
        return saleService.reverse(id, SaleStatus.REFUNDED, request.reason());
    }
}
