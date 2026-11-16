package com.stockpilot.service;

import com.stockpilot.exception.BadRequestException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/** Converts inclusive LocalDate ranges into [from, to) instants in the business time zone. */
public final class DateRanges {
    private DateRanges() {
    }

    public static Instant start(LocalDate date, ZoneId zone) {
        return date == null ? null : date.atStartOfDay(zone).toInstant();
    }

    /** Exclusive upper bound: midnight at the start of the day after {@code date}. */
    public static Instant endExclusive(LocalDate date, ZoneId zone) {
        return date == null ? null : date.plusDays(1).atStartOfDay(zone).toInstant();
    }

    public static void validate(LocalDate from, LocalDate to) {
        if (from != null && to != null && to.isBefore(from)) {
            throw new BadRequestException("'to' date must not be before 'from' date");
        }
    }
}
