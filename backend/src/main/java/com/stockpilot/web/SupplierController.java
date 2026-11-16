package com.stockpilot.web;

import com.stockpilot.security.Roles;
import com.stockpilot.service.SupplierService;
import com.stockpilot.web.dto.ProductDtos.ProductResponse;
import com.stockpilot.web.dto.PurchaseDtos.PurchaseResponse;
import com.stockpilot.web.dto.SupplierDtos.SupplierRequest;
import com.stockpilot.web.dto.SupplierDtos.SupplierResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/suppliers")
@PreAuthorize(Roles.MANAGER_UP)
@RequiredArgsConstructor
public class SupplierController {
    private final SupplierService supplierService;

    @GetMapping
    public List<SupplierResponse> list() {
        return supplierService.list();
    }

    @GetMapping("/{id}")
    public SupplierResponse get(@PathVariable Long id) {
        return supplierService.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SupplierResponse create(@Valid @RequestBody SupplierRequest request) {
        return supplierService.create(request);
    }

    @PutMapping("/{id}")
    public SupplierResponse update(@PathVariable Long id, @Valid @RequestBody SupplierRequest request) {
        return supplierService.update(id, request);
    }

    @GetMapping("/{id}/products")
    public List<ProductResponse> products(@PathVariable Long id) {
        return supplierService.products(id);
    }

    @GetMapping("/{id}/purchases")
    public List<PurchaseResponse> purchases(@PathVariable Long id) {
        return supplierService.purchases(id);
    }
}
