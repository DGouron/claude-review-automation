export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationReport {
  status: 'valid' | 'invalid' | 'not-found';
  issues: ValidationIssue[];
}

export interface ValidationGateway {
  validate(projectPath: string): ValidationReport;
}
