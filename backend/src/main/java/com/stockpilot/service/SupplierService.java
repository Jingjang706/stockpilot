package com.stockpilot.service;

import com.stockpilot.domain.Inventory;
import com.stockpilot.domain.Product;
import com.stockpilot.domain.Supplier;
import com.stockpilot.exception.ConflictException;
import com.stockpilot.exception.NotFoundException;
import com.stockpilot.repository.InventoryRepository;
import com.stockpilot.repository.ProductRepository;
import com.stockpilot.repository.PurchaseRepository;
import com.stockpilot.repository.SupplierRepository;
import com.stockpilot.web.dto.ProductDtos.ProductResponse;
import com.stockpilot.web.dto.PurchaseDtos.PurchaseResponse;
import com.stockpilot.web.dto.SupplierDtos.SupplierRequest;
import com.stockpilot.web.dto.SupplierDtos.SupplierResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SupplierService {
    private final SupplierRepository supplierRepository;
    private final ProductRepository productRepository;
    private final PurchaseRepository purchaseRepository;
    private final InventoryRepository inventoryRepository;
    private final AuditService auditService;

    @Transactional(readOnly = true)
    public List<SupplierResponse> list() {
        return supplierRepository.findAllByOrderByNameAsc().stream().map(SupplierResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public SupplierResponse get(Long id) {
        return SupplierResponse.from(find(id));
    }

    @Transactional
    public SupplierResponse create(SupplierRequest req) {
        String name = req.name().trim();
        if (supplierRepository.existsByNameIgnoreCase(name)) {
            throw new ConflictException("Supplier '" + name + "' already exists");
        }
        Supplier s = new Supplier();
        apply(s, req);
        s = supplierRepository.save(s);
        auditService.log("SUPPLIER_CREATED", "SUPPLIER", s.getId(), name);
        return SupplierResponse.from(s);
    }

    @Transactional
    public SupplierResponse update(Long id, SupplierRequest req) {
        Supplier s = find(id);
        String name = req.name().trim();
        if (!name.equalsIgnoreCase(s.getName()) && supplierRepository.existsByNameIgnoreCase(name)) {
            throw new ConflictException("Supplier '" + name + "' already exists");
        }
        apply(s, req);
        s = supplierRepository.save(s);
        auditService.log("SUPPLIER_UPDATED", "SUPPLIER", id, name);
        return SupplierResponse.from(s);
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> products(Long id) {
        find(id);
        List<Product> products = productRepository.findBySupplierIdOrderByNameAsc(id);
        Map<Long, Integer> stock = products.isEmpty() ? Map.of()
                : inventoryRepository.findByProductIdIn(products.stream().map(Product::getId).toList()).stream()
                .collect(Collectors.toMap(Inventory::getProductId, Inventory::getQuantity));
        return products.stream().map(p -> ProductResponse.from(p, stock.getOrDefault(p.getId(), 0), true)).toList();
    }

    @Transactional(readOnly = true)
    public List<PurchaseResponse> purchases(Long id) {
        find(id);
        return purchaseRepository.findBySupplierIdOrderByCreatedAtDesc(id).stream().map(PurchaseResponse::from).toList();
    }

    private Supplier find(Long id) {
        return supplierRepository.findById(id).orElseThrow(() -> new NotFoundException("Supplier", id));
    }

    private static void apply(Supplier s, SupplierRequest req) {
        s.setName(req.name().trim());
        s.setContactName(blankToNull(req.contactName()));
        s.setEmail(blankToNull(req.email()));
        s.setPhone(blankToNull(req.phone()));
        s.setAddress(blankToNull(req.address()));
        if (req.active() != null) s.setActive(req.active());
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }
}
