package com.stockpilot.exception;

public class InsufficientStockException extends ConflictException {
    public InsufficientStockException(String productName, int available, int requested) {
        super("Insufficient stock for '" + productName + "': " + available + " available, " + requested + " requested");
    }
}
