package com.stockpilot.web;

import com.stockpilot.security.Roles;
import com.stockpilot.service.AuditService;
import com.stockpilot.service.DateRanges;
import com.stockpilot.web.dto.AuditDtos.AuditLogResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;

@RestController
@RequestMapping("/api/audit-logs")
@PreAuthorize(Roles.ADMIN)
@RequiredArgsConstructor
public class AuditLogController {
    private final AuditService auditService;
    private final ZoneId businessZone;

    @GetMapping
    public Page<AuditLogResponse> search(
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String username,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @PageableDefault(size = 25, sort = "createdAt", direction = org.springframework.data.domain.Sort.Direction.DESC)
            Pageable pageable) {
        DateRanges.validate(from, to);
        return auditService.search(action, username, DateRanges.start(from, businessZone),
                DateRanges.endExclusive(to, businessZone), pageable);
    }
}
