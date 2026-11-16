package com.stockpilot.repository;

import com.stockpilot.domain.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ProductRepository extends JpaRepository<Product, Long>, JpaSpecificationExecutor<Product> {
    boolean existsBySku(String sku);

    boolean existsByBarcode(String barcode);

    long countByActiveTrue();

    long countByCategoryId(Long categoryId);

    List<Product> findBySupplierIdOrderByNameAsc(Long supplierId);

    @Query("select p from Product p, Inventory i where i.productId = p.id and p.active = true "
            + "and i.quantity <= p.minStock order by i.quantity asc, p.name asc")
    List<Product> findLowStock();
}
