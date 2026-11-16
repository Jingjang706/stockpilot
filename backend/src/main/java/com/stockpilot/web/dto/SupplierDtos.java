package com.stockpilot.web.dto;

import com.stockpilot.domain.Supplier;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public final class SupplierDtos {
    private SupplierDtos() {
    }

    public record SupplierRequest(
            @NotBlank @Size(max = 150) String name,
            @Size(max = 120) String contactName,
            @Email @Size(max = 150) String email,
            @Size(max = 40) String phone,
            @Size(max = 255) String address,
            Boolean active) {
    }

    public record SupplierResponse(Long id, String name, String contactName, String email, String phone,
                                   String address, boolean active, Instant createdAt) {
        public static SupplierResponse from(Supplier s) {
            return new SupplierResponse(s.getId(), s.getName(), s.getContactName(), s.getEmail(), s.getPhone(),
                    s.getAddress(), s.isActive(), s.getCreatedAt());
        }
    }
}
