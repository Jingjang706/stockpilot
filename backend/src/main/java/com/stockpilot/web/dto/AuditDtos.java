package com.stockpilot.web.dto;

import com.stockpilot.domain.AuditLog;

import java.time.Instant;

public final class AuditDtos {
    private AuditDtos() {
    }

    public record AuditLogResponse(Long id, Long userId, String username, String action, String entityType,
                                   String entityId, String details, String ipAddress, Instant createdAt) {
        public static AuditLogResponse from(AuditLog a) {
            return new AuditLogResponse(a.getId(), a.getUser() == null ? null : a.getUser().getId(), a.getUsername(),
                    a.getAction(), a.getEntityType(), a.getEntityId(), a.getDetails(), a.getIpAddress(), a.getCreatedAt());
        }
    }
}
