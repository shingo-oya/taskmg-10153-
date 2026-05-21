/** Firestore `auditLogins/{id}` */
export interface FirestoreAuditLoginDoc {
  uid: string;
  email: string;
  displayName: string;
  at: string;
}

/** Firestore `auditRoleChanges/{id}` */
export interface FirestoreAuditRoleChangeDoc {
  targetUid?: string;
  targetEmail: string;
  targetName: string;
  previousRole: string;
  newRole: string;
  changedByUid?: string;
  changedByEmail: string;
  changedByName: string;
  at: string;
}

export const AUDIT_LOGINS_COLLECTION = 'auditLogins';
export const AUDIT_ROLE_CHANGES_COLLECTION = 'auditRoleChanges';
