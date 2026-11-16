package com.stockpilot.service;

import com.stockpilot.exception.BadRequestException;
import com.stockpilot.service.SaleCalculator.Line;
import com.stockpilot.service.SaleCalculator.Totals;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SaleCalculatorTest {

    private static Line line(long id, int qty, String price, String cost) {
        return new Line(id, qty, new BigDecimal(price), new BigDecimal(cost));
    }

    @Test
    void computesSubtotalDiscountTotalAndCogs() {
        Totals t = SaleCalculator.compute(List.of(line(1, 4, "10.00", "4.00"), line(2, 2, "2.50", "1.00")),
                new BigDecimal("5.00"));
        assertThat(t.subtotal()).isEqualByComparingTo("45.00");
        assertThat(t.discount()).isEqualByComparingTo("5.00");
        assertThat(t.total()).isEqualByComparingTo("40.00");
        assertThat(t.cogs()).isEqualByComparingTo("18.00");
    }

    @Test
    void roundsLineTotalsHalfUpToTwoDecimals() {
        // 3 x 0.335 = 1.005 -> 1.01 (HALF_UP)
        assertThat(SaleCalculator.lineTotal(new BigDecimal("0.335"), 3)).isEqualByComparingTo("1.01");
    }

    @Test
    void nullDiscountMeansNoDiscount() {
        Totals t = SaleCalculator.compute(List.of(line(1, 1, "9.99", "5.00")), null);
        assertThat(t.discount()).isEqualByComparingTo("0.00");
        assertThat(t.total()).isEqualByComparingTo("9.99");
    }

    @Test
    void rejectsDiscountLargerThanSubtotal() {
        assertThatThrownBy(() -> SaleCalculator.compute(List.of(line(1, 1, "5.00", "2.00")), new BigDecimal("5.01")))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void rejectsNegativeDiscountEmptyCartAndNonPositiveQuantity() {
        assertThatThrownBy(() -> SaleCalculator.compute(List.of(line(1, 1, "5.00", "2.00")), new BigDecimal("-1")))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> SaleCalculator.compute(List.of(), BigDecimal.ZERO))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> SaleCalculator.compute(List.of(line(1, 0, "5.00", "2.00")), BigDecimal.ZERO))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void cashierDiscountLimitIsFivePercentOfSubtotal() {
        assertThat(SaleCalculator.maxCashierDiscount(new BigDecimal("20.00"))).isEqualByComparingTo("1.00");
        assertThat(SaleCalculator.maxCashierDiscount(new BigDecimal("19.99"))).isEqualByComparingTo("1.00");
    }

    @Test
    void grossProfitIsRevenueMinusCogsAndMarginIsPercentOfRevenue() {
        assertThat(SaleCalculator.grossProfit(new BigDecimal("100.00"), new BigDecimal("62.50"))).isEqualByComparingTo("37.50");
        assertThat(SaleCalculator.marginPercent(new BigDecimal("100.00"), new BigDecimal("62.50"))).isEqualByComparingTo("37.5");
        assertThat(SaleCalculator.marginPercent(BigDecimal.ZERO, BigDecimal.ZERO)).isEqualByComparingTo("0");
    }
}
