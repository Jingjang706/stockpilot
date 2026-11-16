package com.stockpilot.service;

import com.stockpilot.domain.Role;
import com.stockpilot.domain.User;
import com.stockpilot.exception.BadRequestException;
import com.stockpilot.exception.ConflictException;
import com.stockpilot.repository.UserRepository;
import com.stockpilot.security.AppUserDetails;
import com.stockpilot.web.dto.UserDtos.CreateUserRequest;
import com.stockpilot.web.dto.UserDtos.CredentialResponse;
import com.stockpilot.web.dto.UserDtos.UpdateUserRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {
    @Mock UserRepository userRepository;
    @Mock AuditService auditService;
    final PasswordEncoder encoder = new BCryptPasswordEncoder(4);

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void temporaryPasswordsAreRandomAndContainLetterAndDigit() {
        String a = UserService.generateTemporaryPassword();
        String b = UserService.generateTemporaryPassword();
        assertThat(a).isNotEqualTo(b).hasSizeGreaterThanOrEqualTo(12).matches(".*[A-Za-z].*").matches(".*\\d.*");
    }

    @Test
    void createdAccountsStoreOnlyABcryptHashAndForcePasswordChange() {
        UserService service = new UserService(userRepository, encoder, auditService);
        when(userRepository.existsByUsernameIgnoreCase("sam")).thenReturn(false);
        when(userRepository.existsByEmailIgnoreCase("sam@x.demo")).thenReturn(false);
        when(userRepository.save(any(User.class))).thenAnswer(i -> {
            User u = i.getArgument(0);
            u.setId(10L);
            return u;
        });

        CredentialResponse result = service.create(new CreateUserRequest("sam", "sam@x.demo", "Sam Smith", Role.CASHIER));

        assertThat(result.user().mustChangePassword()).isTrue();
        assertThat(result.temporaryPassword()).isNotBlank();
        org.mockito.ArgumentCaptor<User> saved = org.mockito.ArgumentCaptor.forClass(User.class);
        org.mockito.Mockito.verify(userRepository).save(saved.capture());
        assertThat(saved.getValue().getPasswordHash()).startsWith("$2").isNotEqualTo(result.temporaryPassword());
        assertThat(encoder.matches(result.temporaryPassword(), saved.getValue().getPasswordHash())).isTrue();
    }

    @Test
    void duplicateUsernameIsRejected() {
        UserService service = new UserService(userRepository, encoder, auditService);
        when(userRepository.existsByUsernameIgnoreCase("sam")).thenReturn(true);
        assertThatThrownBy(() -> service.create(new CreateUserRequest("sam", "sam@x.demo", "Sam", Role.CASHIER)))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void lastActiveAdminCannotBeDeactivated() {
        UserService service = new UserService(userRepository, encoder, auditService);
        authenticateAs(1L, Role.ADMIN);
        User otherAdmin = user(2L, Role.ADMIN);
        when(userRepository.findById(2L)).thenReturn(java.util.Optional.of(otherAdmin));
        when(userRepository.countByRoleAndActiveTrue(Role.ADMIN)).thenReturn(1L);

        assertThatThrownBy(() -> service.update(2L, new UpdateUserRequest("a@x.demo", "Admin Two", Role.ADMIN, false)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void adminCannotDeactivateOrDemoteThemselves() {
        UserService service = new UserService(userRepository, encoder, auditService);
        authenticateAs(1L, Role.ADMIN);
        User self = user(1L, Role.ADMIN);
        when(userRepository.findById(1L)).thenReturn(java.util.Optional.of(self));

        assertThatThrownBy(() -> service.update(1L, new UpdateUserRequest("a@x.demo", "Admin", Role.MANAGER, true)))
                .isInstanceOf(BadRequestException.class);
    }

    private static User user(long id, Role role) {
        User u = new User();
        u.setId(id);
        u.setUsername("u" + id);
        u.setEmail("u" + id + "@x.demo");
        u.setFullName("User " + id);
        u.setPasswordHash("x");
        u.setRole(role);
        u.setActive(true);
        return u;
    }

    private static void authenticateAs(long id, Role role) {
        AppUserDetails details = new AppUserDetails(user(id, role));
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(details, null, details.getAuthorities()));
    }
}
