package com.stockpilot.service;

import com.stockpilot.exception.BadRequestException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/** Pure money arithmetic for sales and reports, kept free of I/O so it is easy to unit test. */
public final class SaleCalculator {
    /** Cashiers may discount up to this fraction of the subtotal without a manager. */
    public static final BigDecimal CASHIER_MAX_DISCOUNT_RATE = new BigDecimal("0.05");

    private SaleCalculator() {
    }

    public record Line(Long productId, int quantity, BigDecimal unitPrice, BigDecimal unitCost) {
    }

    public record Totals(BigDecimal subtotal, BigDecimal discount, BigDecimal total, BigDecimal cogs) {
    }

    public static BigDecimal money(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    public static BigDecimal lineTotal(BigDecimal unitPrice, int quantity) {
        return money(unitPrice.multiply(BigDecimal.valueOf(quantity)));
    }

    public static Totals compute(List<Line> lines, BigDecimal discount) {
        if (lines == null || lines.isEmpty()) {
            throw new BadRequestException("A sale needs at least one item");
        }
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal cogs = BigDecimal.ZERO;
        for (Line line : lines) {
            if (line.quantity() <= 0) {
                throw new BadRequestException("Quantities must be positive");
            }
            subtotal = subtotal.add(lineTotal(line.unitPrice(), line.quantity()));
            cogs = cogs.add(lineTotal(line.unitCost(), line.quantity()));
        }
        BigDecimal d = discount == null ? BigDecimal.ZERO : money(discount);
        if (d.signum() < 0) {
            throw new BadRequestException("Discount cannot be negative");
        }
        if (d.compareTo(subtotal) > 0) {
            throw new BadRequestException("Discount cannot exceed the subtotal");
        }
        return new Totals(money(subtotal), d, money(subtotal.subtract(d)), money(cogs));
    }

    public static BigDecimal maxCashierDiscount(BigDecimal subtotal) {
        return money(subtotal.multiply(CASHIER_MAX_DISCOUNT_RATE));
    }

    public static BigDecimal grossProfit(BigDecimal revenue, BigDecimal cogs) {
        return money(revenue.subtract(cogs));
    }

    /** Gross margin as a percentage of revenue; zero when there is no revenue. */
    public static BigDecimal marginPercent(BigDecimal revenue, BigDecimal cogs) {
        if (revenue.signum() == 0) {
            return BigDecimal.ZERO.setScale(1);
        }
        return revenue.subtract(cogs).multiply(BigDecimal.valueOf(100)).divide(revenue, 1, RoundingMode.HALF_UP);
    }
}
