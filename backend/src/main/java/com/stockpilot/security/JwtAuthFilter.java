package com.stockpilot.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockpilot.exception.ApiError;
import com.stockpilot.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * Authenticates requests carrying a Bearer token. The user is re-loaded on every request so that
 * deactivating an account or changing a role takes effect immediately, not at token expiry.
 */
public class JwtAuthFilter extends OncePerRequestFilter {
    private static final Set<String> ALLOWED_WHILE_PASSWORD_CHANGE_PENDING =
            Set.of("/api/auth/change-password", "/api/auth/me", "/api/auth/logout");

    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public JwtAuthFilter(JwtService jwtService, UserRepository userRepository, ObjectMapper objectMapper) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            var username = jwtService.validateAndGetUsername(token);
            if (username.isPresent() && SecurityContextHolder.getContext().getAuthentication() == null) {
                var user = userRepository.findByUsernameIgnoreCase(username.get()).filter(u -> u.isActive());
                if (user.isPresent()) {
                    AppUserDetails details = new AppUserDetails(user.get());
                    if (details.isMustChangePassword()
                            && !ALLOWED_WHILE_PASSWORD_CHANGE_PENDING.contains(request.getRequestURI())) {
                        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                        objectMapper.writeValue(response.getOutputStream(), ApiError.of(403, "PASSWORD_CHANGE_REQUIRED",
                                "You must change your temporary password before continuing", request.getRequestURI()));
                        return;
                    }
                    var auth = new UsernamePasswordAuthenticationToken(details, null, details.getAuthorities());
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            }
        }
        chain.doFilter(request, response);
    }
}
