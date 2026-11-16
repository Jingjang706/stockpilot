package com.stockpilot.repository;

import com.stockpilot.domain.Inventory;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface InventoryRepository extends JpaRepository<Inventory, Long> {

    /** Row lock: concurrent sales of the same product are serialised here, so stock cannot go negative. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from Inventory i where i.productId = :productId")
    Optional<Inventory> findForUpdate(@Param("productId") Long productId);

    List<Inventory> findByProductIdIn(Collection<Long> productIds);

    @Query("select count(i) from Inventory i, Product p where p.id = i.productId and p.active = true and i.quantity = 0")
    long countOutOfStock();

    @Query("select count(i) from Inventory i, Product p where p.id = i.productId and p.active = true "
            + "and i.quantity > 0 and i.quantity <= p.minStock")
    long countLowStock();

    @Query("select count(i) from Inventory i, Product p where p.id = i.productId and p.active = true "
            + "and i.quantity > p.minStock")
    long countHealthy();

    /** Stock valued at cost. May be null when there are no rows. */
    @Query("select sum(i.quantity * p.costPrice) from Inventory i, Product p where p.id = i.productId and p.active = true")
    BigDecimal totalCostValue();

    /** Stock valued at selling price. May be null when there are no rows. */
    @Query("select sum(i.quantity * p.sellingPrice) from Inventory i, Product p where p.id = i.productId and p.active = true")
    BigDecimal totalRetailValue();
}
