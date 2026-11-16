package com.stockpilot.repository;

import com.stockpilot.domain.Sale;
import com.stockpilot.domain.SaleStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface SaleRepository extends JpaRepository<Sale, Long>, JpaSpecificationExecutor<Sale> {

    @Query(value = "select nextval('receipt_seq')", nativeQuery = true)
    Long nextReceiptSequence();

    /** Row lock so a sale cannot be voided/refunded twice concurrently. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Sale s where s.id = :id")
    Optional<Sale> findForUpdate(@Param("id") Long id);

    List<Sale> findTop10ByOrderByCreatedAtDesc();

    /** Single row: [count, sum(total), sum(cogs)]. Sums may be null. */
    @Query("select count(s), sum(s.total), sum(s.cogs) from Sale s "
            + "where s.status = :status and s.createdAt >= :from and s.createdAt < :to")
    List<Object[]> totals(@Param("status") SaleStatus status, @Param("from") Instant from, @Param("to") Instant to);

    /** Rows: [productId, productName, sku, unitsSold, revenue] for completed sales. */
    @Query("select si.product.id, si.productName, si.sku, sum(si.quantity), sum(si.lineTotal) from SaleItem si "
            + "where si.sale.status = :status and si.sale.createdAt >= :from and si.sale.createdAt < :to "
            + "group by si.product.id, si.productName, si.sku order by sum(si.quantity) desc, sum(si.lineTotal) desc")
    List<Object[]> bestSellers(@Param("status") SaleStatus status, @Param("from") Instant from,
                               @Param("to") Instant to, Pageable pageable);
}
