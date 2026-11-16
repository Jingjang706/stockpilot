package com.stockpilot.repository;

import com.stockpilot.domain.Purchase;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PurchaseRepository extends JpaRepository<Purchase, Long>, JpaSpecificationExecutor<Purchase> {

    @Query(value = "select nextval('po_seq')", nativeQuery = true)
    Long nextPoSequence();

    /** Row lock so goods cannot be received twice concurrently. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Purchase p where p.id = :id")
    Optional<Purchase> findForUpdate(@Param("id") Long id);

    List<Purchase> findBySupplierIdOrderByCreatedAtDesc(Long supplierId);
}
