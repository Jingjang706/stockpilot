package com.stockpilot.web;

import com.stockpilot.security.Roles;
import com.stockpilot.service.ProductService;
import com.stockpilot.web.dto.ProductDtos.ProductRequest;
import com.stockpilot.web.dto.ProductDtos.ProductResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/products")
@RequiredArgsConstructor
public class ProductController {
    private final ProductService productService;

    /** Open to all staff; cashiers get a response without cost prices and never see archived products. */
    @GetMapping
    @PreAuthorize(Roles.ANY_STAFF)
    public Page<ProductResponse> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) Long supplierId,
            @RequestParam(defaultValue = "false") boolean includeArchived,
            @PageableDefault(size = 20, sort = "name") Pageable pageable) {
        return productService.list(q, categoryId, supplierId, includeArchived, pageable);
    }

    @GetMapping("/{id}")
    @PreAuthorize(Roles.ANY_STAFF)
    public ProductResponse get(@PathVariable Long id) {
        return productService.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Roles.MANAGER_UP)
    public ProductResponse create(@Valid @RequestBody ProductRequest request) {
        return productService.create(request);
    }

    @PutMapping("/{id}")
    @PreAuthorize(Roles.MANAGER_UP)
    public ProductResponse update(@PathVariable Long id, @Valid @RequestBody ProductRequest request) {
        return productService.update(id, request);
    }

    /** Archives the product (soft delete). */
    @DeleteMapping("/{id}")
    @PreAuthorize(Roles.MANAGER_UP)
    public ProductResponse archive(@PathVariable Long id) {
        return productService.setActive(id, false);
    }

    @PostMapping("/{id}/restore")
    @PreAuthorize(Roles.MANAGER_UP)
    public ProductResponse restore(@PathVariable Long id) {
        return productService.setActive(id, true);
    }
}
