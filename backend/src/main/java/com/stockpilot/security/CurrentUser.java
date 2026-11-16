package com.stockpilot.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.access.AccessDeniedException;

import java.util.Optional;

public final class CurrentUser {
    private CurrentUser() {
    }

    public static Optional<AppUserDetails> get() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AppUserDetails details) {
            return Optional.of(details);
        }
        return Optional.empty();
    }

    public static AppUserDetails require() {
        return get().orElseThrow(() -> new AccessDeniedException("Authentication required"));
    }
}
