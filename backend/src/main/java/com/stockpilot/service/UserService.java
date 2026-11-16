package com.stockpilot.service;

import com.stockpilot.domain.Role;
import com.stockpilot.domain.User;
import com.stockpilot.exception.BadRequestException;
import com.stockpilot.exception.ConflictException;
import com.stockpilot.exception.NotFoundException;
import com.stockpilot.repository.UserRepository;
import com.stockpilot.security.CurrentUser;
import com.stockpilot.web.dto.UserDtos.CreateUserRequest;
import com.stockpilot.web.dto.UserDtos.CredentialResponse;
import com.stockpilot.web.dto.UserDtos.UpdateUserRequest;
import com.stockpilot.web.dto.UserDtos.UserResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.List;

/**
 * Employee account management (ADMIN only, enforced at the controller).
 * Passwords are never chosen or seen by the admin: the server generates a one-time temporary
 * password that must be changed at first login.
 */
@Service
@RequiredArgsConstructor
public class UserService {
    private static final String PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditService auditService;

    @Transactional(readOnly = true)
    public List<UserResponse> list() {
        return userRepository.findAllByOrderByFullNameAsc().stream().map(UserResponse::from).toList();
    }

    @Transactional
    public CredentialResponse create(CreateUserRequest req) {
        String username = req.username().trim();
        String email = req.email().trim();
        if (userRepository.existsByUsernameIgnoreCase(username)) {
            throw new ConflictException("Username '" + username + "' is already taken");
        }
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ConflictException("Email '" + email + "' is already in use");
        }
        String temp = generateTemporaryPassword();
        User u = new User();
        u.setUsername(username);
        u.setEmail(email);
        u.setFullName(req.fullName().trim());
        u.setRole(req.role());
        u.setPasswordHash(passwordEncoder.encode(temp));
        u.setMustChangePassword(true);
        u = userRepository.save(u);
        auditService.log("USER_CREATED", "USER", u.getId(), username + " as " + u.getRole());
        return new CredentialResponse(UserResponse.from(u), temp);
    }

    @Transactional
    public UserResponse update(Long id, UpdateUserRequest req) {
        User u = userRepository.findById(id).orElseThrow(() -> new NotFoundException("User", id));
        Long actorId = CurrentUser.require().getId();
        String email = req.email().trim();
        if (!email.equalsIgnoreCase(u.getEmail()) && userRepository.existsByEmailIgnoreCase(email)) {
            throw new ConflictException("Email '" + email + "' is already in use");
        }
        boolean losesAdmin = u.getRole() == Role.ADMIN && u.isActive()
                && (req.role() != Role.ADMIN || !req.active());
        if (losesAdmin) {
            if (u.getId().equals(actorId)) {
                throw new BadRequestException("You cannot demote or deactivate your own admin account");
            }
            if (userRepository.countByRoleAndActiveTrue(Role.ADMIN) <= 1) {
                throw new BadRequestException("At least one active admin is required");
            }
        }
        if (u.getId().equals(actorId) && !req.active()) {
            throw new BadRequestException("You cannot deactivate your own account");
        }
        StringBuilder changes = new StringBuilder();
        if (u.getRole() != req.role()) changes.append("role ").append(u.getRole()).append(" -> ").append(req.role()).append("; ");
        if (u.isActive() != req.active()) changes.append("active ").append(u.isActive()).append(" -> ").append(req.active()).append("; ");
        u.setEmail(email);
        u.setFullName(req.fullName().trim());
        u.setRole(req.role());
        u.setActive(req.active());
        userRepository.save(u);
        auditService.log("USER_UPDATED", "USER", id, u.getUsername() + (changes.length() > 0 ? " - " + changes : ""));
        return UserResponse.from(u);
    }

    @Transactional
    public CredentialResponse resetPassword(Long id) {
        User u = userRepository.findById(id).orElseThrow(() -> new NotFoundException("User", id));
        String temp = generateTemporaryPassword();
        u.setPasswordHash(passwordEncoder.encode(temp));
        u.setMustChangePassword(true);
        userRepository.save(u);
        auditService.log("PASSWORD_RESET", "USER", id, u.getUsername());
        return new CredentialResponse(UserResponse.from(u), temp);
    }

    static String generateTemporaryPassword() {
        StringBuilder sb = new StringBuilder(14);
        for (int i = 0; i < 12; i++) {
            sb.append(PASSWORD_ALPHABET.charAt(RANDOM.nextInt(PASSWORD_ALPHABET.length())));
        }
        return sb.append("a7").toString();   // guarantees a letter and a digit
    }
}
