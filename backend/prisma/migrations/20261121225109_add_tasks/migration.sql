-- CreateTable
CREATE TABLE `tasks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `priority` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_tasks_owner`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_occurrences` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task_id` INTEGER NOT NULL,
    `recurrence_rule_id` INTEGER NULL,
    `sequence_no` INTEGER NOT NULL,
    `original_date` DATE NULL,
    `scheduled_date` DATE NULL,
    `scheduled_time` TIME(0) NULL,
    `timezone` VARCHAR(64) NOT NULL,
    `scheduled_at_utc` DATETIME(3) NULL,
    `status` ENUM('pending', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
    `title_override` VARCHAR(200) NULL,
    `description_override` TEXT NULL,
    `priority_override` ENUM('low', 'medium', 'high') NULL,
    `reminders_overridden` BOOLEAN NOT NULL DEFAULT false,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_occ_user_calendar`(`scheduled_date`, `status`),
    INDEX `idx_occ_rule`(`recurrence_rule_id`),
    INDEX `idx_occ_due`(`scheduled_at_utc`),
    UNIQUE INDEX `uq_task_occ_sequence`(`task_id`, `sequence_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_occurrences` ADD CONSTRAINT `task_occurrences_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
