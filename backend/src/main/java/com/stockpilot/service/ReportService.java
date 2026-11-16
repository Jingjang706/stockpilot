package com.stockpilot.service;

import com.stockpilot.domain.Inventory;
import com.stockpilot.domain.Product;
import com.stockpilot.domain.PurchaseStatus;
import com.stockpilot.domain.SaleStatus;
import com.stockpilot.exception.BadRequestException;
import com.stockpilot.repository.InventoryRepository;
import com.stockpilot.repository.ProductRepository;
import com.stockpilot.repository.SaleRepository;
import com.stockpilot.web.dto.PurchaseDtos.PurchaseResponse;
import com.stockpilot.web.dto.ReportDtos.PurchaseReport;
import com.stockpilot.web.dto.ReportDtos.RevenueOverview;
import com.stockpilot.web.dto.ReportDtos.SalesBucket;
import com.stockpilot.web.dto.ReportDtos.SalesReport;
import com.stockpilot.web.dto.ReportDtos.TopProduct;
import com.stockpilot.web.dto.ReportDtos.Totals;
import com.stockpilot.web.dto.ReportDtos.ValuationReport;
import com.stockpilot.web.dto.ReportDtos.ValuationRow;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Reporting. Definitions used everywhere:
 *   revenue      = sum of totals of COMPLETED sales (voided and refunded sales are excluded)
 *   COGS         = sum of unit cost x quantity captured on each sale line at the time of sale
 *   gross profit = revenue - COGS
 */
@Service
@RequiredArgsConstructor
public class ReportService {
    private final SaleRepository saleRepository;
    private final ProductRepository productRepository;
    private final InventoryRepository inventoryRepository;
    private final PurchaseService purchaseService;
    private final ZoneId businessZone;

    @PersistenceContext
    private EntityManager entityManager;

    @Transactional(readOnly = true)
    public Totals totals(SaleStatus status, Instant from, Instant to) {
        Object[] row = saleRepository.totals(status, from, to).get(0);
        long count = row[0] == null ? 0 : ((Number) row[0]).longValue();
        BigDecimal revenue = toMoney(row[1]);
        BigDecimal cogs = toMoney(row[2]);
        return new Totals(count, revenue, cogs, SaleCalculator.grossProfit(revenue, cogs));
    }

    @Transactional(readOnly = true)
    public SalesReport sales(String grain, LocalDate from, LocalDate to) {
        DateRanges.validate(from, to);
        List<SalesBucket> buckets = salesBuckets(grain, DateRanges.start(from, businessZone),
                DateRanges.endExclusive(to, businessZone));
        BigDecimal revenue = buckets.stream().map(SalesBucket::revenue).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal cogs = buckets.stream().map(SalesBucket::cogs).reduce(BigDecimal.ZERO, BigDecimal::add);
        long count = buckets.stream().mapToLong(SalesBucket::count).sum();
        return new SalesReport(grain, from, to, buckets,
                new Totals(count, revenue, cogs, SaleCalculator.grossProfit(revenue, cogs)));
    }

    /** Completed-sale buckets by day/week/month/year in the business time zone. */
    @Transactional(readOnly = true)
    public List<SalesBucket> salesBuckets(String grain, Instant from, Instant to) {
        String unit = switch (grain == null ? "" : grain.toLowerCase()) {
            case "day", "daily" -> "day";
            case "week", "weekly" -> "week";
            case "month", "monthly" -> "month";
            case "year", "annual", "yearly" -> "year";
            default -> throw new BadRequestException("grain must be one of: day, week, month, year");
        };
        // 'unit' comes from the whitelist above, so inlining it is safe.
        String sql = "select to_char(date_trunc('" + unit + "', created_at at time zone :tz), 'YYYY-MM-DD') as bucket, "
                + "count(*), coalesce(sum(total), 0), coalesce(sum(cogs), 0) "
                + "from sales where status = 'COMPLETED' "
                + (from != null ? "and created_at >= :from " : "")
                + (to != null ? "and created_at < :to " : "")
                + "group by 1 order by 1";
        Query query = entityManager.createNativeQuery(sql);
        query.setParameter("tz", businessZone.getId());
        if (from != null) query.setParameter("from", from);
        if (to != null) query.setParameter("to", to);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = query.getResultList();
        List<SalesBucket> out = new ArrayList<>();
        for (Object[] r : rows) {
            BigDecimal revenue = toMoney(r[2]);
            BigDecimal cogs = toMoney(r[3]);
            out.add(new SalesBucket((String) r[0], ((Number) r[1]).longValue(), revenue, cogs,
                    SaleCalculator.grossProfit(revenue, cogs)));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<TopProduct> bestSelling(Instant from, Instant to, int limit) {
        int size = Math.min(Math.max(limit, 1), 100);
        return saleRepository.bestSellers(SaleStatus.COMPLETED, from, to, PageRequest.of(0, size)).stream()
                .map(r -> new TopProduct(((Number) r[0]).longValue(), (String) r[1], (String) r[2],
                        ((Number) r[3]).longValue(), toMoney(r[4])))
                .toList();
    }

    @Transactional(readOnly = true)
    public ValuationReport valuation() {
        List<Product> products = productRepository.findAll(Sort.by("name")).stream().filter(Product::isActive).toList();
        Map<Long, Integer> stock = products.isEmpty() ? Map.of()
                : inventoryRepository.findByProductIdIn(products.stream().map(Product::getId).toList()).stream()
                .collect(Collectors.toMap(Inventory::getProductId, Inventory::getQuantity));
        List<ValuationRow> rows = new ArrayList<>();
        BigDecimal cost = BigDecimal.ZERO;
        BigDecimal retail = BigDecimal.ZERO;
        for (Product p : products) {
            int qty = stock.getOrDefault(p.getId(), 0);
            BigDecimal costValue = SaleCalculator.lineTotal(p.getCostPrice(), qty);
            BigDecimal retailValue = SaleCalculator.lineTotal(p.getSellingPrice(), qty);
            rows.add(new ValuationRow(p.getId(), p.getSku(), p.getName(),
                    p.getCategory() == null ? null : p.getCategory().getName(), qty, p.getCostPrice(), costValue, retailValue));
            cost = cost.add(costValue);
            retail = retail.add(retailValue);
        }
        return new ValuationReport(rows, SaleCalculator.money(cost), SaleCalculator.money(retail));
    }

    @Transactional(readOnly = true)
    public PurchaseReport purchases(LocalDate from, LocalDate to) {
        DateRanges.validate(from, to);
        List<PurchaseResponse> purchases = purchaseService.listAll(DateRanges.start(from, businessZone),
                DateRanges.endExclusive(to, businessZone));
        BigDecimal ordered = purchases.stream().filter(p -> p.status() != PurchaseStatus.CANCELLED)
                .map(PurchaseResponse::totalCost).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal received = purchases.stream().filter(p -> p.status() == PurchaseStatus.RECEIVED)
                .map(PurchaseResponse::totalCost).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new PurchaseReport(from, to, purchases, SaleCalculator.money(ordered), SaleCalculator.money(received));
    }

    @Transactional(readOnly = true)
    public RevenueOverview revenueOverview(LocalDate from, LocalDate to) {
        DateRanges.validate(from, to);
        Instant f = DateRanges.start(from, businessZone);
        Instant t = DateRanges.endExclusive(to, businessZone);
        Totals completed = totals(SaleStatus.COMPLETED, f, t);
        Totals voided = totals(SaleStatus.VOIDED, f, t);
        Totals refunded = totals(SaleStatus.REFUNDED, f, t);
        BigDecimal spend = purchases(from, to).totalReceived();
        return new RevenueOverview(from, to, completed, SaleCalculator.marginPercent(completed.revenue(), completed.cogs()),
                voided.count(), voided.revenue(), refunded.count(), refunded.revenue(), spend);
    }

    private static BigDecimal toMoney(Object value) {
        return value == null ? BigDecimal.ZERO.setScale(2) : SaleCalculator.money(new BigDecimal(value.toString()));
    }
}
