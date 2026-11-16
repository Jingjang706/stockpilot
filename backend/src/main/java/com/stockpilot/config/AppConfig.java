package com.stockpilot.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.ZoneId;

@Configuration
public class AppConfig {
    /** Business time zone used for "today", daily buckets and receipt dates. */
    @Bean
    public ZoneId businessZone(@Value("${app.timezone}") String zone) {
        return ZoneId.of(zone);
    }

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
