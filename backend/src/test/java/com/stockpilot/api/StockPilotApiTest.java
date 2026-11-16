package com.stockpilot.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end API tests against a real PostgreSQL (Testcontainers) with Flyway migrations and the demo seed.
 * Requires Docker; skipped automatically when Docker is not available.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class StockPilotApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    // ------------------------------------------------------------------ authentication

    @Test
    void loginWithValidCredentialsReturnsTokenAndUser() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("username", "admin", "password", "Admin@12345"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.user.role").value("ADMIN"));
    }

    @Test
    void wrongPasswordAndUnknownUserGetTheSameGenericError() throws Exception {
        for (String user : List.of("admin", "nobody")) {
            mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content(body(Map.of("username", user, "password", "wrong-password-1"))))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.message").value("Invalid username or password"));
        }
    }

    @Test
    void failedLoginIsWrittenToTheAuditLog() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("username", "audit-probe", "password", "nope-nope-1"))));
        String admin = login("admin", "Admin@12345");
        mvc.perform(get("/api/audit-logs").param("action", "LOGIN_FAILED").param("username", "audit-probe")
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].action").value("LOGIN_FAILED"));
    }

    @Test
    void protectedEndpointsRequireAToken() throws Exception {
        mvc.perform(get("/api/products")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/products").header("Authorization", "Bearer not.a.jwt")).andExpect(status().isUnauthorized());
    }

    @Test
    void healthEndpointIsPublic() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }

    // ------------------------------------------------------------------ role-based access control

    @Test
    void cashierIsBlockedFromAdminAndManagementEndpoints() throws Exception {
        String cashier = login("cashier", "Cashier@12345");
        for (String url : List.of("/api/users", "/api/audit-logs", "/api/dashboard", "/api/suppliers",
                "/api/purchases", "/api/reports/sales", "/api/inventory/movements")) {
            mvc.perform(get(url).header("Authorization", "Bearer " + cashier)).andExpect(status().isForbidden());
        }
    }

    @Test
    void managerCanUseManagementEndpointsButNotUserAdministration() throws Exception {
        String manager = login("manager", "Manager@12345");
        mvc.perform(get("/api/dashboard").header("Authorization", "Bearer " + manager)).andExpect(status().isOk());
        mvc.perform(get("/api/suppliers").header("Authorization", "Bearer " + manager)).andExpect(status().isOk());
        mvc.perform(get("/api/users").header("Authorization", "Bearer " + manager)).andExpect(status().isForbidden());
    }

    @Test
    void adminCanListUsersAndNoPasswordHashIsExposed() throws Exception {
        String admin = login("admin", "Admin@12345");
        mvc.perform(get("/api/users").header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].passwordHash").doesNotExist())
                .andExpect(jsonPath("$[0].password").doesNotExist());
    }

    @Test
    void cashierProductListHidesCostPrice() throws Exception {
        String cashier = login("cashier", "Cashier@12345");
        mvc.perform(get("/api/products").header("Authorization", "Bearer " + cashier))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].costPrice").value(nullValue()))
                .andExpect(jsonPath("$.content[0].sellingPrice").isNotEmpty());
    }

    // ------------------------------------------------------------------ POS and inventory

    @Test
    void checkoutReducesStockAndWritesReceiptPaymentAndMovement() throws Exception {
        String cashier = login("cashier", "Cashier@12345");
        String manager = login("manager", "Manager@12345");
        long productId = productWithStock(manager, 5);
        int before = stock(manager, productId);

        MvcResult result = mvc.perform(post("/api/sales").header("Authorization", "Bearer " + cashier)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("items", List.of(Map.of("productId", productId, "quantity", 2)),
                                "paymentMethod", "CASH"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.receiptNumber").value(org.hamcrest.Matchers.startsWith("SP-")))
                .andExpect(jsonPath("$.payments[0].method").value("CASH"))
                .andExpect(jsonPath("$.cogs").value(nullValue()))
                .andReturn();

        assertThat(stock(manager, productId)).isEqualTo(before - 2);
        mvc.perform(get("/api/inventory/movements").param("productId", String.valueOf(productId))
                        .param("type", "SALE").header("Authorization", "Bearer " + manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].quantityChange").value(-2))
                .andExpect(jsonPath("$.content[0].quantityAfter").value(before - 2));
        assertThat(json.readTree(result.getResponse().getContentAsString()).get("status").asText()).isEqualTo("COMPLETED");
    }

    @Test
    void checkoutWithInsufficientStockFailsAndLeavesStockUntouched() throws Exception {
        String cashier = login("cashier", "Cashier@12345");
        String manager = login("manager", "Manager@12345");
        long productId = productWithStock(manager, 1);
        int before = stock(manager, productId);

        mvc.perform(post("/api/sales").header("Authorization", "Bearer " + cashier)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("items", List.of(Map.of("productId", productId, "quantity", before + 1)),
                                "paymentMethod", "CASH"))))
                .andExpect(status().isConflict());

        assertThat(stock(manager, productId)).isEqualTo(before);
    }

    @Test
    void aMultiLineSaleWithOneShortLineRollsBackEveryLine() throws Exception {
        String cashier = login("cashier", "Cashier@12345");
        String manager = login("manager", "Manager@12345");
        long first = productWithStock(manager, 3);
        long second = anotherProductWithStock(manager, 3, first);
        int firstBefore = stock(manager, first);
        int secondBefore = stock(manager, second);

        mvc.perform(post("/api/sales").header("Authorization", "Bearer " + cashier)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("items", List.of(
                                        Map.of("productId", first, "quantity", 1),
                                        Map.of("productId", second, "quantity", secondBefore + 5)),
                                "paymentMethod", "CASH"))))
                .andExpect(status().isConflict());

        assertThat(stock(manager, first)).isEqualTo(firstBefore);     // the good line was rolled back too
        assertThat(stock(manager, second)).isEqualTo(secondBefore);
    }

    @Test
    void cashierDiscountAboveLimitIsForbiddenButManagerMayDiscount() throws Exception {
        String cashier = login("cashier", "Cashier@12345");
        String manager = login("manager", "Manager@12345");
        long productId = productWithStock(manager, 5);
        double price = json.readTree(mvc.perform(get("/api/products/" + productId)
                .header("Authorization", "Bearer " + manager)).andReturn().getResponse().getContentAsString())
                .get("sellingPrice").asDouble();
        Map<String, Object> request = Map.of("items", List.of(Map.of("productId", productId, "quantity", 1)),
                "discountAmount", price, "paymentMethod", "OTHER");

        mvc.perform(post("/api/sales").header("Authorization", "Bearer " + cashier)
                .contentType(MediaType.APPLICATION_JSON).content(body(request))).andExpect(status().isForbidden());
        mvc.perform(post("/api/sales").header("Authorization", "Bearer " + manager)
                        .contentType(MediaType.APPLICATION_JSON).content(body(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.total").value(0.0));
    }

    @Test
    void voidingASaleRestoresStockAndIsOnlyForManagers() throws Exception {
        String cashier = login("cashier", "Cashier@12345");
        String manager = login("manager", "Manager@12345");
        long productId = productWithStock(manager, 5);
        int before = stock(manager, productId);
        long saleId = json.readTree(mvc.perform(post("/api/sales").header("Authorization", "Bearer " + cashier)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("items", List.of(Map.of("productId", productId, "quantity", 3)),
                                "paymentMethod", "CASH")))).andReturn().getResponse().getContentAsString()).get("id").asLong();
        assertThat(stock(manager, productId)).isEqualTo(before - 3);

        mvc.perform(post("/api/sales/" + saleId + "/void").header("Authorization", "Bearer " + cashier)
                .contentType(MediaType.APPLICATION_JSON).content(body(Map.of("reason", "oops")))).andExpect(status().isForbidden());
        mvc.perform(post("/api/sales/" + saleId + "/void").header("Authorization", "Bearer " + manager)
                        .contentType(MediaType.APPLICATION_JSON).content(body(Map.of("reason", "Keying error"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("VOIDED"));

        assertThat(stock(manager, productId)).isEqualTo(before);
        mvc.perform(post("/api/sales/" + saleId + "/void").header("Authorization", "Bearer " + manager)
                .contentType(MediaType.APPLICATION_JSON).content(body(Map.of("reason", "again")))).andExpect(status().isConflict());
    }

    @Test
    void cashierSeesOnlyTheirOwnSales() throws Exception {
        String cashier = login("cashier", "Cashier@12345");
        mvc.perform(get("/api/sales").param("size", "100").header("Authorization", "Bearer " + cashier))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.cashierName != 'Chloe Cashier')]").isEmpty());
    }

    @Test
    void negativeStockCannotBeCreatedByManualAdjustment() throws Exception {
        String manager = login("manager", "Manager@12345");
        long productId = productWithStock(manager, 1);
        int before = stock(manager, productId);
        mvc.perform(post("/api/inventory/movements").header("Authorization", "Bearer " + manager)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("productId", productId, "type", "ADJUSTMENT", "quantity", -(before + 1),
                                "reason", "Test"))))
                .andExpect(status().isConflict());
        assertThat(stock(manager, productId)).isEqualTo(before);
    }

    // ------------------------------------------------------------------ purchasing

    @Test
    void receivingAnApprovedPurchaseOrderAddsStockExactlyOnce() throws Exception {
        String manager = login("manager", "Manager@12345");
        long productId = productWithStock(manager, 1);
        int before = stock(manager, productId);

        long poId = json.readTree(mvc.perform(post("/api/purchases").header("Authorization", "Bearer " + manager)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("supplierId", 1, "notes", "test order",
                                "items", List.of(Map.of("productId", productId, "quantity", 10, "unitCost", 1.5))))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andReturn().getResponse().getContentAsString()).get("id").asLong();

        mvc.perform(post("/api/purchases/" + poId + "/receive").header("Authorization", "Bearer " + manager))
                .andExpect(status().isConflict());   // must be approved first
        mvc.perform(post("/api/purchases/" + poId + "/approve").header("Authorization", "Bearer " + manager))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"));
        mvc.perform(post("/api/purchases/" + poId + "/receive").header("Authorization", "Bearer " + manager))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RECEIVED"));

        assertThat(stock(manager, productId)).isEqualTo(before + 10);
        mvc.perform(post("/api/purchases/" + poId + "/receive").header("Authorization", "Bearer " + manager))
                .andExpect(status().isConflict());
        assertThat(stock(manager, productId)).isEqualTo(before + 10);
    }

    // ------------------------------------------------------------------ products and validation

    @Test
    void duplicateSkuIsRejectedAndInvalidInputReturnsFieldErrors() throws Exception {
        String manager = login("manager", "Manager@12345");
        mvc.perform(post("/api/products").header("Authorization", "Bearer " + manager)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("sku", "bev-001", "name", "Dup", "costPrice", 1, "sellingPrice", 2))))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/products").header("Authorization", "Bearer " + manager)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("sku", "", "name", "", "costPrice", -1, "sellingPrice", 2))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.sku").exists())
                .andExpect(jsonPath("$.fieldErrors.costPrice").exists());
    }

    @Test
    void reportsUseRealDataAndKeepRevenueCostAndProfitSeparate() throws Exception {
        String manager = login("manager", "Manager@12345");
        mvc.perform(get("/api/reports/revenue-overview").header("Authorization", "Bearer " + manager))
                .andExpect(status().isOk());
        MvcResult r = mvc.perform(get("/api/reports/sales").param("grain", "month").header("Authorization", "Bearer " + manager))
                .andExpect(status().isOk()).andReturn();
        JsonNode totals = json.readTree(r.getResponse().getContentAsString()).get("totals");
        assertThat(totals.get("revenue").decimalValue().subtract(totals.get("cogs").decimalValue()))
                .isEqualByComparingTo(totals.get("grossProfit").decimalValue());
        mvc.perform(get("/api/reports/sales").param("grain", "decade").header("Authorization", "Bearer " + manager))
                .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------------ helpers

    private String body(Object o) throws Exception {
        return json.writeValueAsString(o);
    }

    private String login(String username, String password) throws Exception {
        String res = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("username", username, "password", password))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(res).get("token").asText();
    }

    private int stock(String token, long productId) throws Exception {
        String res = mvc.perform(get("/api/products/" + productId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(res).get("quantity").asInt();
    }

    private long productWithStock(String token, int minQuantity) throws Exception {
        return anotherProductWithStock(token, minQuantity, -1);
    }

    private long anotherProductWithStock(String token, int minQuantity, long excludeId) throws Exception {
        String res = mvc.perform(get("/api/products").param("size", "100").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        for (JsonNode p : json.readTree(res).get("content")) {
            if (p.get("id").asLong() != excludeId && p.get("quantity").asInt() >= minQuantity) {
                return p.get("id").asLong();
            }
        }
        throw new IllegalStateException("No seeded product with at least " + minQuantity + " in stock");
    }
}
