package com.stockpilot.service;

import com.stockpilot.domain.User;
import com.stockpilot.exception.ApiException;
import com.stockpilot.exception.BadRequestException;
import com.stockpilot.repository.UserRepository;
import com.stockpilot.security.AppUserDetails;
import com.stockpilot.security.CurrentUser;
import com.stockpilot.security.JwtService;
import com.stockpilot.web.dto.AuthDtos.ChangePasswordRequest;
import com.stockpilot.web.dto.AuthDtos.LoginRequest;
import com.stockpilot.web.dto.AuthDtos.LoginResponse;
import com.stockpilot.web.dto.AuthDtos.UserSummary;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@RequiredArgsConstructor
public class AuthService {
    private static final String GENERIC_FAILURE = "Invalid username or password";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuditService auditService;

    /** Not transactional as a whole: failed-login audit rows must persist even though we then throw. */
    public LoginResponse login(LoginRequest req) {
        String username = req.username().trim();
        User user = userRepository.findByUsernameIgnoreCase(username).orElse(null);
        // Same message for unknown user and wrong password, so usernames cannot be probed.
        if (user == null || !passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            auditService.record(user == null ? null : user.getId(), username, "LOGIN_FAILED", "USER",
                    user == null ? null : user.getId(), user == null ? "Unknown username" : "Wrong password");
            throw new ApiException(HttpStatus.UNAUTHORIZED, GENERIC_FAILURE);
        }
        if (!user.isActive()) {
            auditService.record(user.getId(), username, "LOGIN_FAILED", "USER", user.getId(), "Account deactivated");
            throw new ApiException(HttpStatus.FORBIDDEN, "This account has been deactivated");
        }
        return completeLogin(user);
    }

    private LoginResponse completeLogin(User user) {
        user.setLastLoginAt(Instant.now());
        userRepository.save(user);
        auditService.record(user.getId(), user.getUsername(), "LOGIN_SUCCESS", "USER", user.getId(), null);
        Instant expiresAt = jwtService.expiryFromNow();
        return new LoginResponse(jwtService.issue(user, expiresAt), expiresAt, UserSummary.from(user));
    }

    @Transactional(readOnly = true)
    public UserSummary me() {
        AppUserDetails actor = CurrentUser.require();
        return UserSummary.from(userRepository.findById(actor.getId()).orElseThrow());
    }

    @Transactional
    public void logout() {
        auditService.log("LOGOUT", "USER", CurrentUser.require().getId(), null);
    }

    @Transactional
    public void changePassword(ChangePasswordRequest req) {
        AppUserDetails actor = CurrentUser.require();
        User user = userRepository.findById(actor.getId()).orElseThrow();
        if (!passwordEncoder.matches(req.currentPassword(), user.getPasswordHash())) {
            throw new BadRequestException("Current password is incorrect");
        }
        if (passwordEncoder.matches(req.newPassword(), user.getPasswordHash())) {
            throw new BadRequestException("New password must be different from the current password");
        }
        user.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        user.setMustChangePassword(false);
        userRepository.save(user);
        auditService.log("PASSWORD_CHANGED", "USER", user.getId(), null);
    }
}
