package com.stockpilot.web;

import com.stockpilot.security.Roles;
import com.stockpilot.service.ProductService;
import com.stockpilot.web.dto.ProductDtos.CategoryRequest;
import com.stockpilot.web.dto.ProductDtos.CategoryResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
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
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class CategoryController {
    private final ProductService productService;

    @GetMapping
    @PreAuthorize(Roles.ANY_STAFF)
    public List<CategoryResponse> list() {
        return productService.categories();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Roles.MANAGER_UP)
    public CategoryResponse create(@Valid @RequestBody CategoryRequest request) {
        return productService.createCategory(request);
    }

    @PutMapping("/{id}")
    @PreAuthorize(Roles.MANAGER_UP)
    public CategoryResponse update(@PathVariable Long id, @Valid @RequestBody CategoryRequest request) {
        return productService.updateCategory(id, request);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize(Roles.MANAGER_UP)
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        productService.deleteCategory(id);
        return ResponseEntity.noContent().build();
    }
}
