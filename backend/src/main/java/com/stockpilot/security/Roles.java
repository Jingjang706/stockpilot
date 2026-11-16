package com.stockpilot.security;

/** SpEL expressions for @PreAuthorize, so authorization rules read the same everywhere. */
public final class Roles {
    private Roles() {
    }

    public static final String ADMIN = "hasRole('ADMIN')";
    public static final String MANAGER_UP = "hasAnyRole('ADMIN','MANAGER')";
    public static final String ANY_STAFF = "hasAnyRole('ADMIN','MANAGER','CASHIER')";
}
