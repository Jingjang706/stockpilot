package com.stockpilot.web.dto;

import com.stockpilot.domain.Role;
import com.stockpilot.domain.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public final class UserDtos {
    private UserDtos() {
    }

    public record CreateUserRequest(
            @NotBlank @Size(min = 3, max = 50)
            @Pattern(regexp = "^[A-Za-z0-9._-]+$", message = "Only letters, digits, dot, underscore and dash")
            String username,
            @NotBlank @Email @Size(max = 150) String email,
            @NotBlank @Size(max = 120) String fullName,
            @NotNull Role role) {
    }

    public record UpdateUserRequest(
            @NotBlank @Email @Size(max = 150) String email,
            @NotBlank @Size(max = 120) String fullName,
            @NotNull Role role,
            @NotNull Boolean active) {
    }

    public record UserResponse(Long id, String username, String email, String fullName, Role role, boolean active,
                               boolean mustChangePassword, Instant lastLoginAt, Instant createdAt) {
        public static UserResponse from(User u) {
            return new UserResponse(u.getId(), u.getUsername(), u.getEmail(), u.getFullName(), u.getRole(),
                    u.isActive(), u.isMustChangePassword(), u.getLastLoginAt(), u.getCreatedAt());
        }
    }

    /** The temporary password is shown exactly once, at creation or reset. */
    public record CredentialResponse(UserResponse user, String temporaryPassword) {
    }
}
