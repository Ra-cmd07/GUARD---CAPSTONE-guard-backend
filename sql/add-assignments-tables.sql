ALTER TABLE students
  ADD COLUMN IF NOT EXISTS teacher_id INT UNSIGNED DEFAULT NULL;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS subject_teacher_id INT UNSIGNED DEFAULT NULL;

CREATE TABLE IF NOT EXISTS assignments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  year_level  VARCHAR(50)  NOT NULL,
  strand      VARCHAR(100) DEFAULT NULL,
  track       VARCHAR(100) DEFAULT NULL,
  section     VARCHAR(100) NOT NULL,
  subject     VARCHAR(100) NOT NULL,
  teacher_id  INT UNSIGNED DEFAULT NULL,
  subject_teacher_id INT UNSIGNED DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by  INT UNSIGNED DEFAULT NULL,
  updated_by  INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_assignments_teacher_id (teacher_id),
  KEY idx_assignments_subject_teacher_id (subject_teacher_id),
  CONSTRAINT fk_assignments_teacher FOREIGN KEY (teacher_id) REFERENCES teachers (id) ON DELETE SET NULL,
  CONSTRAINT fk_assignments_subject_teacher FOREIGN KEY (subject_teacher_id) REFERENCES teachers (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assignment_students (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id INT UNSIGNED NOT NULL,
  student_id    INT UNSIGNED NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by    INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assignment_student (assignment_id, student_id),
  KEY idx_assignment_students_assignment_id (assignment_id),
  KEY idx_assignment_students_student_id (student_id),
  CONSTRAINT fk_assignment_students_assignment FOREIGN KEY (assignment_id) REFERENCES assignments (id) ON DELETE CASCADE,
  CONSTRAINT fk_assignment_students_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB;
