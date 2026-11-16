package com.stockpilot.web;

import com.stockpilot.domain.MovementType;
import com.stockpilot.security.Roles;
import com.stockpilot.service.DateRanges;
import com.stockpilot.service.InventoryService;
import com.stockpilot.service.ProductService;
import com.stockpilot.web.dto.InventoryDtos.MovementRequest;
import com.stockpilot.web.dto.InventoryDtos.MovementResponse;
import com.stockpilot.web.dto.ProductDtos.ProductResponse;
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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

@RestController
@RequestMapping("/api/inventory")
@PreAuthorize(Roles.MANAGER_UP)
@RequiredArgsConstructor
public class InventoryController {
    private final InventoryService inventoryService;
    private final ProductService productService;
    private final ZoneId businessZone;

    @GetMapping("/movements")
    public Page<MovementResponse> movements(
            @RequestParam(required = false) Long productId,
            @RequestParam(required = false) MovementType type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @PageableDefault(size = 25, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        DateRanges.validate(from, to);
        return inventoryService.movements(productId, type, DateRanges.start(from, businessZone),
                DateRanges.endExclusive(to, businessZone), pageable);
    }

    @PostMapping("/movements")
    @ResponseStatus(HttpStatus.CREATED)
    public MovementResponse record(@Valid @RequestBody MovementRequest request) {
        return inventoryService.recordManual(request);
    }

    @GetMapping("/low-stock")
    public List<ProductResponse> lowStock() {
        return productService.lowStock();
    }
}
