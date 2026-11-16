package com.stockpilot.exception;

import org.springframework.http.HttpStatus;

public class NotFoundException extends ApiException {
    public NotFoundException(String what, Object id) {
        super(HttpStatus.NOT_FOUND, what + " " + id + " was not found");
    }
}
