package com.stockpilot.service;

import com.stockpilot.domain.MovementType;
import com.stockpilot.domain.Product;
import com.stockpilot.domain.Role;
import com.stockpilot.domain.Sale;
import com.stockpilot.domain.SaleItem;
import com.stockpilot.domain.SaleStatus;
import com.stockpilot.domain.User;
import com.stockpilot.exception.BadRequestException;
import com.stockpilot.exception.ConflictException;
import com.stockpilot.repository.ProductRepository;
import com.stockpilot.repository.SaleRepository;
import com.stockpilot.repository.UserRepository;
import com.stockpilot.security.AppUserDetails;
import com.stockpilot.web.dto.SaleDtos.CartItem;
import com.stockpilot.web.dto.SaleDtos.CheckoutRequest;
import com.stockpilot.web.dto.SaleDtos.SaleResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SaleServiceTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-01-15T10:00:00Z"), ZoneOffset.UTC);

    @Mock SaleRepository saleRepository;
    @Mock ProductRepository productRepository;
    @Mock UserRepository userRepository;
    @Mock InventoryService inventoryService;
    @Mock AuditService auditService;

    SaleService service;
    User cashier;
    Product pen;     // id 1: price 2.50, cost 1.00
    Product binder;  // id 2: price 10.00, cost 4.00

    @BeforeEach
    void setUp() {
        service = new SaleService(saleRepository, productRepository, userRepository, inventoryService,
                auditService, CLOCK, ZoneOffset.UTC);
        cashier = user(3L, Role.CASHIER);
        pen = product(1L, "2.50", "1.00", true);
        binder = product(2L, "10.00", "4.00", true);
        authenticate(cashier);
        lenient().when(userRepository.getReferenceById(3L)).thenReturn(cashier);
        lenient().when(saleRepository.nextReceiptSequence()).thenReturn(1001L);
        lenient().when(saleRepository.save(any(Sale.class))).thenAnswer(inv -> {
            Sale s = inv.getArgument(0);
            s.setId(50L);
            return s;
        });
    }

    @AfterEach
    void clearSecurity() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void checkoutMergesLinesComputesTotalsAndDeductsStockInProductIdOrder() {
        when(productRepository.findAllById(any())).thenReturn(List.of(binder, pen));
        var request = new CheckoutRequest(
                List.of(new CartItem(2L, 3), new CartItem(1L, 2), new CartItem(2L, 1)), null,
                com.stockpilot.domain.PaymentMethod.CASH, null);

        SaleResponse response = service.checkout(request);

        assertThat(response.receiptNumber()).isEqualTo("SP-20260115-1001");
        assertThat(response.subtotal()).isEqualByComparingTo("45.00");   // 4 x 10.00 + 2 x 2.50
        assertThat(response.total()).isEqualByComparingTo("45.00");
        assertThat(response.cogs()).isNull();                            // cost hidden from cashiers
        assertThat(response.items()).hasSize(2);
        assertThat(response.payments()).hasSize(1);
        assertThat(response.payments().get(0).amount()).isEqualByComparingTo("45.00");

        InOrder order = inOrder(inventoryService);
        order.verify(inventoryService).applyChange(eq(1L), eq(MovementType.SALE), eq(-2), any(), isNull(), eq("SALE"), eq(50L));
        order.verify(inventoryService).applyChange(eq(2L), eq(MovementType.SALE), eq(-4), any(), isNull(), eq("SALE"), eq(50L));
    }

    @Test
    void cashierCannotGiveDiscountAboveFivePercent() {
        when(productRepository.findAllById(any())).thenReturn(List.of(binder));
        var request = new CheckoutRequest(List.of(new CartItem(2L, 2)), new BigDecimal("2.00"),   // 10% of 20.00
                com.stockpilot.domain.PaymentMethod.CASH, null);

        assertThatThrownBy(() -> service.checkout(request)).isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(inventoryService);
    }

    @Test
    void cashierMayGiveDiscountUpToFivePercent() {
        when(productRepository.findAllById(any())).thenReturn(List.of(binder));
        var request = new CheckoutRequest(List.of(new CartItem(2L, 2)), new BigDecimal("1.00"),   // exactly 5%
                com.stockpilot.domain.PaymentMethod.BANK_TRANSFER, "TX-1");

        SaleResponse response = service.checkout(request);

        assertThat(response.total()).isEqualByComparingTo("19.00");
        assertThat(response.discountAmount()).isEqualByComparingTo("1.00");
    }

    @Test
    void managerMayGiveLargerDiscounts() {
        authenticate(user(2L, Role.MANAGER));
        lenient().when(userRepository.getReferenceById(2L)).thenReturn(user(2L, Role.MANAGER));
        when(productRepository.findAllById(any())).thenReturn(List.of(binder));
        var request = new CheckoutRequest(List.of(new CartItem(2L, 2)), new BigDecimal("10.00"),
                com.stockpilot.domain.PaymentMethod.CASH, null);

        SaleResponse response = service.checkout(request);

        assertThat(response.total()).isEqualByComparingTo("10.00");
        assertThat(response.cogs()).isEqualByComparingTo("8.00");        // managers see cost of goods
    }

    @Test
    void archivedProductsCannotBeSold() {
        binder.setActive(false);
        when(productRepository.findAllById(any())).thenReturn(List.of(binder));
        var request = new CheckoutRequest(List.of(new CartItem(2L, 1)), null, com.stockpilot.domain.PaymentMethod.CASH, null);

        assertThatThrownBy(() -> service.checkout(request)).isInstanceOf(ConflictException.class);
        verifyNoInteractions(inventoryService);
    }

    @Test
    void unknownProductIsRejected() {
        when(productRepository.findAllById(any())).thenReturn(List.of(pen));   // asked for 1 and 2
        var request = new CheckoutRequest(List.of(new CartItem(1L, 1), new CartItem(2L, 1)), null,
                com.stockpilot.domain.PaymentMethod.CASH, null);

        assertThatThrownBy(() -> service.checkout(request)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void voidIsRefusedWhenSaleWasMadeOnAnEarlierDay() {
        authenticate(user(2L, Role.MANAGER));
        lenient().when(userRepository.getReferenceById(2L)).thenReturn(user(2L, Role.MANAGER));
        Sale old = completedSale(Instant.parse("2026-01-14T09:00:00Z"));
        when(saleRepository.findForUpdate(7L)).thenReturn(Optional.of(old));

        assertThatThrownBy(() -> service.reverse(7L, SaleStatus.VOIDED, "mistake")).isInstanceOf(ConflictException.class);
        verifyNoInteractions(inventoryService);
    }

    @Test
    void refundReturnsEveryLineToStockAndMarksSaleRefunded() {
        authenticate(user(2L, Role.MANAGER));
        lenient().when(userRepository.getReferenceById(2L)).thenReturn(user(2L, Role.MANAGER));
        Sale old = completedSale(Instant.parse("2026-01-10T09:00:00Z"));
        when(saleRepository.findForUpdate(7L)).thenReturn(Optional.of(old));

        SaleResponse response = service.reverse(7L, SaleStatus.REFUNDED, "Customer returned goods");

        assertThat(response.status()).isEqualTo(SaleStatus.REFUNDED);
        verify(inventoryService).applyChange(eq(1L), eq(MovementType.REFUND), eq(2), any(), eq("Customer returned goods"), eq("SALE"), anyLong());
    }

    @Test
    void alreadyReversedSalesCannotBeReversedAgain() {
        authenticate(user(2L, Role.MANAGER));
        Sale s = completedSale(Instant.parse("2026-01-15T08:00:00Z"));
        s.setStatus(SaleStatus.VOIDED);
        when(saleRepository.findForUpdate(7L)).thenReturn(Optional.of(s));

        assertThatThrownBy(() -> service.reverse(7L, SaleStatus.REFUNDED, "again")).isInstanceOf(ConflictException.class);
    }

    // ---------------------------------------------------------------- helpers

    private Sale completedSale(Instant createdAt) {
        Sale s = new Sale();
        s.setId(7L);
        s.setReceiptNumber("SP-TEST-1");
        s.setCashier(cashier);
        s.setSubtotal(new BigDecimal("5.00"));
        s.setTotal(new BigDecimal("5.00"));
        s.setCreatedAt(createdAt);
        SaleItem item = new SaleItem();
        item.setProduct(pen);
        item.setProductName(pen.getName());
        item.setSku(pen.getSku());
        item.setQuantity(2);
        item.setUnitPrice(pen.getSellingPrice());
        item.setUnitCost(pen.getCostPrice());
        item.setLineTotal(new BigDecimal("5.00"));
        s.addItem(item);
        return s;
    }

    private static User user(long id, Role role) {
        User u = new User();
        u.setId(id);
        u.setUsername("u" + id);
        u.setFullName("User " + id);
        u.setPasswordHash("x");
        u.setRole(role);
        u.setActive(true);
        return u;
    }

    private static Product product(long id, String price, String cost, boolean active) {
        Product p = new Product();
        p.setId(id);
        p.setSku("SKU-" + id);
        p.setName("Product " + id);
        p.setSellingPrice(new BigDecimal(price));
        p.setCostPrice(new BigDecimal(cost));
        p.setActive(active);
        return p;
    }

    private static void authenticate(User user) {
        AppUserDetails details = new AppUserDetails(user);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(details, null, details.getAuthorities()));
    }
}
