package com.stockpilot.service;

import com.stockpilot.domain.AuditLog;
import com.stockpilot.repository.AuditLogRepository;
import com.stockpilot.repository.UserRepository;
import com.stockpilot.security.AppUserDetails;
import com.stockpilot.security.CurrentUser;
import com.stockpilot.web.dto.AuditDtos.AuditLogResponse;
import jakarta.persistence.criteria.Predicate;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class AuditService {
    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;

    /** Records an action by the currently authenticated user, in the caller's transaction. */
    @Transactional
    public void log(String action, String entityType, Object entityId, String details) {
        Optional<AppUserDetails> actor = CurrentUser.get();
        record(actor.map(AppUserDetails::getId).orElse(null),
                actor.map(AppUserDetails::getUsername).orElse("system"),
                action, entityType, entityId, details);
    }

    /** Records an action for an explicit actor (e.g. login attempts, where nobody is authenticated yet). */
    @Transactional
    public void record(Long userId, String username, String action, String entityType, Object entityId, String details) {
        AuditLog entry = new AuditLog();
        entry.setUser(userId == null ? null : userRepository.getReferenceById(userId));
        entry.setUsername(truncate(username, 50));
        entry.setAction(action);
        entry.setEntityType(entityType);
        entry.setEntityId(entityId == null ? null : truncate(String.valueOf(entityId), 40));
        entry.setDetails(truncate(details, 1000));
        entry.setIpAddress(clientIp());
        auditLogRepository.save(entry);
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> search(String action, String username, Instant from, Instant to, Pageable pageable) {
        Specification<AuditLog> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (action != null && !action.isBlank()) ps.add(cb.equal(root.get("action"), action.trim().toUpperCase()));
            if (username != null && !username.isBlank()) {
                ps.add(cb.like(cb.lower(root.get("username")), "%" + username.trim().toLowerCase() + "%"));
            }
            if (from != null) ps.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from));
            if (to != null) ps.add(cb.lessThan(root.get("createdAt"), to));
            return cb.and(ps.toArray(new Predicate[0]));
        };
        return auditLogRepository.findAll(spec, pageable).map(AuditLogResponse::from);
    }

    private static String clientIp() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            HttpServletRequest request = attrs.getRequest();
            return truncate(request.getRemoteAddr(), 45);
        }
        return null;
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
