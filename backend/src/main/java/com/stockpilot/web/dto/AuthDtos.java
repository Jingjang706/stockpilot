package com.stockpilot.web.dto;

import com.stockpilot.domain.Role;
import com.stockpilot.domain.User;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public final class AuthDtos {
    private AuthDtos() {
    }

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {
    }

    public record ChangePasswordRequest(
            @NotBlank String currentPassword,
            @NotBlank
            @Size(min = 8, max = 72, message = "Password must be 8-72 characters")
            @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "Password must contain a letter and a digit")
            String newPassword) {
    }

    public record UserSummary(Long id, String username, String fullName, String email, Role role,
                              boolean mustChangePassword) {
        public static UserSummary from(User u) {
            return new UserSummary(u.getId(), u.getUsername(), u.getFullName(), u.getEmail(), u.getRole(),
                    u.isMustChangePassword());
        }
    }

    public record LoginResponse(String token, Instant expiresAt, UserSummary user) {
    }
}
