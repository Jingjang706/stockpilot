package com.stockpilot.service;

import com.stockpilot.domain.Inventory;
import com.stockpilot.domain.MovementType;
import com.stockpilot.domain.Product;
import com.stockpilot.domain.StockMovement;
import com.stockpilot.exception.BadRequestException;
import com.stockpilot.exception.InsufficientStockException;
import com.stockpilot.repository.InventoryRepository;
import com.stockpilot.repository.ProductRepository;
import com.stockpilot.repository.StockMovementRepository;
import com.stockpilot.repository.UserRepository;
import com.stockpilot.web.dto.InventoryDtos.MovementRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class InventoryServiceTest {
    @Mock InventoryRepository inventoryRepository;
    @Mock StockMovementRepository movementRepository;
    @Mock ProductRepository productRepository;
    @Mock UserRepository userRepository;
    @Mock AuditService auditService;
    @InjectMocks InventoryService service;

    @Test
    void refusesToTakeStockBelowZeroAndWritesNothing() {
        Product p = new Product();
        p.setName("Widget");
        when(inventoryRepository.findForUpdate(1L)).thenReturn(Optional.of(new Inventory(1L, 3)));
        when(productRepository.findById(1L)).thenReturn(Optional.of(p));

        assertThatThrownBy(() -> service.applyChange(1L, MovementType.SALE, -5, BigDecimal.ONE, null, "SALE", 9L))
                .isInstanceOf(InsufficientStockException.class)
                .hasMessageContaining("3 available");

        verify(inventoryRepository, never()).save(any());
        verify(movementRepository, never()).save(any());
    }

    @Test
    void updatesQuantityAndRecordsMovementWithResultingBalance() {
        Inventory inv = new Inventory(1L, 10);
        when(inventoryRepository.findForUpdate(1L)).thenReturn(Optional.of(inv));
        when(productRepository.getReferenceById(1L)).thenReturn(new Product());
        when(movementRepository.save(any(StockMovement.class))).thenAnswer(i -> i.getArgument(0));

        StockMovement m = service.applyChange(1L, MovementType.STOCK_IN, 5, new BigDecimal("2.00"), "restock", "MANUAL", null);

        assertThat(inv.getQuantity()).isEqualTo(15);
        assertThat(m.getQuantityChange()).isEqualTo(5);
        assertThat(m.getQuantityAfter()).isEqualTo(15);
        assertThat(m.getType()).isEqualTo(MovementType.STOCK_IN);
    }

    @Test
    void rejectsZeroChange() {
        assertThatThrownBy(() -> service.applyChange(1L, MovementType.ADJUSTMENT, 0, null, "x", "MANUAL", null))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void manualStockOutTakesPositiveQuantityAndReducesStock() {
        Inventory inv = new Inventory(1L, 10);
        when(inventoryRepository.findForUpdate(1L)).thenReturn(Optional.of(inv));
        when(productRepository.getReferenceById(1L)).thenReturn(new Product());
        when(movementRepository.save(any(StockMovement.class))).thenAnswer(i -> i.getArgument(0));

        service.recordManual(new MovementRequest(1L, MovementType.STOCK_OUT, 4, "Damaged", null));

        assertThat(inv.getQuantity()).isEqualTo(6);
    }

    @Test
    void manualEntryRejectsSystemMovementTypesAndNonPositiveStockIn() {
        assertThatThrownBy(() -> service.recordManual(new MovementRequest(1L, MovementType.SALE, 1, "x", null)))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.recordManual(new MovementRequest(1L, MovementType.STOCK_IN, -2, "x", null)))
                .isInstanceOf(BadRequestException.class);
    }
}
