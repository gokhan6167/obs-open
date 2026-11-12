/** OBS API görünüm tipleri (backend DTO'larıyla hizalı). */
export interface HealthStatus {
  status: string;
  deploymentMode: string;
  time: string;
}

export interface Program {
  id: string;
  code: string;
  name: string;
  level: string;
}

export interface Term {
  id: string;
  year: number;
  term: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface StudentView {
  id: string;
  studentNo: string;
  status: string;
  programId: string;
}

export interface GraduationStatus {
  completion: {
    isComplete: boolean;
    missingMandatory: string[];
    missingMandatoryEcts: number;
    meetsGpa: boolean;
    meetsEcts: boolean;
  };
  gpa: number;
  earnedEcts: number;
  honor: string;
}

export interface VerifyResult {
  valid: boolean;
  docType?: string;
  studentNo?: string;
  programName?: string;
  issuedAt?: string;
  revoked?: boolean;
}
