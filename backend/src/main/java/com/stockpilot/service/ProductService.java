package com.stockpilot.service;

import com.stockpilot.domain.Category;
import com.stockpilot.domain.Inventory;
import com.stockpilot.domain.MovementType;
import com.stockpilot.domain.Product;
import com.stockpilot.domain.Role;
import com.stockpilot.domain.Supplier;
import com.stockpilot.exception.ConflictException;
import com.stockpilot.exception.NotFoundException;
import com.stockpilot.repository.CategoryRepository;
import com.stockpilot.repository.InventoryRepository;
import com.stockpilot.repository.ProductRepository;
import com.stockpilot.repository.SupplierRepository;
import com.stockpilot.security.CurrentUser;
import com.stockpilot.web.dto.ProductDtos.CategoryRequest;
import com.stockpilot.web.dto.ProductDtos.CategoryResponse;
import com.stockpilot.web.dto.ProductDtos.ProductRequest;
import com.stockpilot.web.dto.ProductDtos.ProductResponse;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProductService {
    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final SupplierRepository supplierRepository;
    private final InventoryRepository inventoryRepository;
    private final InventoryService inventoryService;
    private final AuditService auditService;

    // ------------------------------------------------------------------ products

    @Transactional(readOnly = true)
    public Page<ProductResponse> list(String q, Long categoryId, Long supplierId, boolean includeArchived,
                                      Pageable pageable) {
        boolean cashier = isCashier();
        Page<Product> page = productRepository.findAll(
                filter(q, categoryId, supplierId, includeArchived && !cashier), pageable);
        Map<Long, Integer> stock = stockByProduct(page.getContent());
        return page.map(p -> ProductResponse.from(p, stock.getOrDefault(p.getId(), 0), !cashier));
    }

    @Transactional(readOnly = true)
    public ProductResponse get(Long id) {
        Product p = find(id);
        int qty = inventoryRepository.findById(id).map(Inventory::getQuantity).orElse(0);
        return ProductResponse.from(p, qty, !isCashier());
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> lowStock() {
        List<Product> products = productRepository.findLowStock();
        Map<Long, Integer> stock = stockByProduct(products);
        return products.stream().map(p -> ProductResponse.from(p, stock.getOrDefault(p.getId(), 0), true)).toList();
    }

    @Transactional
    public ProductResponse create(ProductRequest req) {
        String sku = normaliseSku(req.sku());
        if (productRepository.existsBySku(sku)) {
            throw new ConflictException("SKU '" + sku + "' is already in use");
        }
        String barcode = blankToNull(req.barcode());
        if (barcode != null && productRepository.existsByBarcode(barcode)) {
            throw new ConflictException("Barcode '" + barcode + "' is already in use");
        }
        Product p = new Product();
        apply(p, req, sku, barcode);
        p = productRepository.save(p);
        inventoryRepository.save(new Inventory(p.getId(), 0));
        int initial = req.initialStock() == null ? 0 : req.initialStock();
        if (initial > 0) {
            inventoryService.applyChange(p.getId(), MovementType.STOCK_IN, initial, p.getCostPrice(),
                    "Initial stock", "PRODUCT", p.getId());
        }
        auditService.log("PRODUCT_CREATED", "PRODUCT", p.getId(), "SKU " + sku + " - " + p.getName());
        return ProductResponse.from(p, initial, true);
    }

    @Transactional
    public ProductResponse update(Long id, ProductRequest req) {
        Product p = find(id);
        String sku = normaliseSku(req.sku());
        if (!sku.equals(p.getSku()) && productRepository.existsBySku(sku)) {
            throw new ConflictException("SKU '" + sku + "' is already in use");
        }
        String barcode = blankToNull(req.barcode());
        if (barcode != null && !barcode.equals(p.getBarcode()) && productRepository.existsByBarcode(barcode)) {
            throw new ConflictException("Barcode '" + barcode + "' is already in use");
        }
        String oldPrices = p.getCostPrice() + "/" + p.getSellingPrice();
        apply(p, req, sku, barcode);
        productRepository.save(p);
        String newPrices = p.getCostPrice() + "/" + p.getSellingPrice();
        auditService.log("PRODUCT_UPDATED", "PRODUCT", id, "SKU " + sku
                + (oldPrices.equals(newPrices) ? "" : " - cost/price " + oldPrices + " -> " + newPrices));
        int qty = inventoryRepository.findById(id).map(Inventory::getQuantity).orElse(0);
        return ProductResponse.from(p, qty, true);
    }

    /** Archive instead of delete: sales and stock history keep referring to the product. */
    @Transactional
    public ProductResponse setActive(Long id, boolean active) {
        Product p = find(id);
        p.setActive(active);
        productRepository.save(p);
        auditService.log(active ? "PRODUCT_RESTORED" : "PRODUCT_ARCHIVED", "PRODUCT", id, "SKU " + p.getSku());
        int qty = inventoryRepository.findById(id).map(Inventory::getQuantity).orElse(0);
        return ProductResponse.from(p, qty, true);
    }

    // ------------------------------------------------------------------ categories

    @Transactional(readOnly = true)
    public List<CategoryResponse> categories() {
        return categoryRepository.findAllByOrderByNameAsc().stream().map(CategoryResponse::from).toList();
    }

    @Transactional
    public CategoryResponse createCategory(CategoryRequest req) {
        String name = req.name().trim();
        if (categoryRepository.existsByNameIgnoreCase(name)) {
            throw new ConflictException("Category '" + name + "' already exists");
        }
        Category c = new Category();
        c.setName(name);
        c.setDescription(blankToNull(req.description()));
        c = categoryRepository.save(c);
        auditService.log("CATEGORY_CREATED", "CATEGORY", c.getId(), name);
        return CategoryResponse.from(c);
    }

    @Transactional
    public CategoryResponse updateCategory(Long id, CategoryRequest req) {
        Category c = categoryRepository.findById(id).orElseThrow(() -> new NotFoundException("Category", id));
        String name = req.name().trim();
        if (!name.equalsIgnoreCase(c.getName()) && categoryRepository.existsByNameIgnoreCase(name)) {
            throw new ConflictException("Category '" + name + "' already exists");
        }
        c.setName(name);
        c.setDescription(blankToNull(req.description()));
        auditService.log("CATEGORY_UPDATED", "CATEGORY", id, name);
        return CategoryResponse.from(categoryRepository.save(c));
    }

    @Transactional
    public void deleteCategory(Long id) {
        Category c = categoryRepository.findById(id).orElseThrow(() -> new NotFoundException("Category", id));
        if (productRepository.countByCategoryId(id) > 0) {
            throw new ConflictException("Category is in use by products; reassign them first");
        }
        categoryRepository.delete(c);
        auditService.log("CATEGORY_DELETED", "CATEGORY", id, c.getName());
    }

    // ------------------------------------------------------------------ helpers

    Product find(Long id) {
        return productRepository.findById(id).orElseThrow(() -> new NotFoundException("Product", id));
    }

    private void apply(Product p, ProductRequest req, String sku, String barcode) {
        p.setSku(sku);
        p.setBarcode(barcode);
        p.setName(req.name().trim());
        p.setDescription(blankToNull(req.description()));
        p.setCostPrice(req.costPrice());
        p.setSellingPrice(req.sellingPrice());
        p.setMinStock(req.minStock() == null ? 0 : req.minStock());
        p.setImageUrl(blankToNull(req.imageUrl()));
        Category category = req.categoryId() == null ? null
                : categoryRepository.findById(req.categoryId()).orElseThrow(() -> new NotFoundException("Category", req.categoryId()));
        Supplier supplier = req.supplierId() == null ? null
                : supplierRepository.findById(req.supplierId()).orElseThrow(() -> new NotFoundException("Supplier", req.supplierId()));
        p.setCategory(category);
        p.setSupplier(supplier);
    }

    private Map<Long, Integer> stockByProduct(List<Product> products) {
        if (products.isEmpty()) return new HashMap<>();
        List<Long> ids = products.stream().map(Product::getId).toList();
        return inventoryRepository.findByProductIdIn(ids).stream()
                .collect(Collectors.toMap(Inventory::getProductId, Inventory::getQuantity));
    }

    private static Specification<Product> filter(String q, Long categoryId, Long supplierId, boolean includeArchived) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (!includeArchived) ps.add(cb.isTrue(root.get("active")));
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase() + "%";
                ps.add(cb.or(
                        cb.like(cb.lower(root.get("name")), like),
                        cb.like(cb.lower(root.get("sku")), like),
                        cb.like(cb.lower(cb.coalesce(root.<String>get("barcode"), "")), like)));
            }
            if (categoryId != null) ps.add(cb.equal(root.get("category").get("id"), categoryId));
            if (supplierId != null) ps.add(cb.equal(root.get("supplier").get("id"), supplierId));
            return cb.and(ps.toArray(new Predicate[0]));
        };
    }

    private static boolean isCashier() {
        return CurrentUser.require().getRole() == Role.CASHIER;
    }

    private static String normaliseSku(String sku) {
        return sku.trim().toUpperCase();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
