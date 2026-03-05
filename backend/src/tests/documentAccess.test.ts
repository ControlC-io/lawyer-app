import {
  canUserAccessFileByMetadata,
  getAccessibleFileIds,
  buildVirtualTree,
} from '../lib/documentAccess';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  prisma: {
    documentPermissionAssignment: { findMany: jest.fn() },
    documentPermissionRule: { findMany: jest.fn(), count: jest.fn() },
    filesMetadataValue: { findMany: jest.fn() },
    file: { findMany: jest.fn() },
    userDocumentTreeConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

const mockAssignments = prisma.documentPermissionAssignment.findMany as jest.Mock;
const mockRules = prisma.documentPermissionRule.findMany as jest.Mock;
const mockRuleCount = prisma.documentPermissionRule.count as jest.Mock;
const mockMetadataValues = prisma.filesMetadataValue.findMany as jest.Mock;
const mockFiles = prisma.file.findMany as jest.Mock;

describe('documentAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('canUserAccessFileByMetadata', () => {
    it('returns write when user is company admin', async () => {
      const result = await canUserAccessFileByMetadata({
        userId: 'user-1',
        companyId: 'company-1',
        fileId: 'file-1',
        isCompanyAdmin: true,
        userGroupIds: [],
      });
      expect(result).toBe('write');
      expect(mockRules).not.toHaveBeenCalled();
    });

    it('returns read when no permission rules exist at all', async () => {
      mockRuleCount.mockResolvedValue(0);

      const result = await canUserAccessFileByMetadata({
        userId: 'user-1',
        companyId: 'company-1',
        fileId: 'file-1',
        isCompanyAdmin: false,
        userGroupIds: [],
      });
      expect(result).toBe('read');
    });

    it('returns null when rules exist but none assigned to user', async () => {
      mockRuleCount.mockResolvedValue(2);
      mockRules.mockResolvedValue([]);

      const result = await canUserAccessFileByMetadata({
        userId: 'user-1',
        companyId: 'company-1',
        fileId: 'file-1',
        isCompanyAdmin: false,
        userGroupIds: [],
      });
      expect(result).toBeNull();
    });

    it('returns read when user rule matches file metadata', async () => {
      mockRuleCount.mockResolvedValue(1);
      mockRules.mockResolvedValue([
        {
          id: 'rule-1',
          permission_type: 'read',
          conditions: [{ key_id: 'key-type', value: 'invoice' }],
          assignments: [{ user_id: 'user-1', group_id: null }],
        },
      ]);
      mockMetadataValues.mockResolvedValue([
        { metadata_id: 'key-type', value: 'invoice' },
      ]);

      const result = await canUserAccessFileByMetadata({
        userId: 'user-1',
        companyId: 'company-1',
        fileId: 'file-1',
        isCompanyAdmin: false,
        userGroupIds: [],
      });
      expect(result).toBe('read');
    });

    it('returns write when user has write permission rule that matches', async () => {
      mockRuleCount.mockResolvedValue(1);
      mockRules.mockResolvedValue([
        {
          id: 'rule-1',
          permission_type: 'write',
          conditions: [{ key_id: 'key-type', value: 'invoice' }],
          assignments: [{ user_id: 'user-1', group_id: null }],
        },
      ]);
      mockMetadataValues.mockResolvedValue([
        { metadata_id: 'key-type', value: 'invoice' },
      ]);

      const result = await canUserAccessFileByMetadata({
        userId: 'user-1',
        companyId: 'company-1',
        fileId: 'file-1',
        isCompanyAdmin: false,
        userGroupIds: [],
      });
      expect(result).toBe('write');
    });

    it('returns null when rule conditions do not match file metadata', async () => {
      mockRuleCount.mockResolvedValue(1);
      mockRules.mockResolvedValue([
        {
          id: 'rule-1',
          permission_type: 'read',
          conditions: [{ key_id: 'key-type', value: 'invoice' }],
          assignments: [{ user_id: 'user-1', group_id: null }],
        },
      ]);
      mockMetadataValues.mockResolvedValue([
        { metadata_id: 'key-type', value: 'report' },
      ]);

      const result = await canUserAccessFileByMetadata({
        userId: 'user-1',
        companyId: 'company-1',
        fileId: 'file-1',
        isCompanyAdmin: false,
        userGroupIds: [],
      });
      expect(result).toBeNull();
    });

    it('returns permission when rule matches via group', async () => {
      mockRuleCount.mockResolvedValue(1);
      mockRules.mockResolvedValue([
        {
          id: 'rule-1',
          permission_type: 'read',
          conditions: [{ key_id: 'key-dept', value: 'finance' }],
          assignments: [{ user_id: null, group_id: 'group-1' }],
        },
      ]);
      mockMetadataValues.mockResolvedValue([
        { metadata_id: 'key-dept', value: 'finance' },
      ]);

      const result = await canUserAccessFileByMetadata({
        userId: 'user-1',
        companyId: 'company-1',
        fileId: 'file-1',
        isCompanyAdmin: false,
        userGroupIds: ['group-1'],
      });
      expect(result).toBe('read');
    });

    it('requires ALL conditions in a rule to match (AND logic)', async () => {
      mockRuleCount.mockResolvedValue(1);
      mockRules.mockResolvedValue([
        {
          id: 'rule-1',
          permission_type: 'read',
          conditions: [
            { key_id: 'key-type', value: 'invoice' },
            { key_id: 'key-year', value: '2026' },
          ],
          assignments: [{ user_id: 'user-1', group_id: null }],
        },
      ]);
      // File only has type=invoice, missing year=2026
      mockMetadataValues.mockResolvedValue([
        { metadata_id: 'key-type', value: 'invoice' },
      ]);

      const result = await canUserAccessFileByMetadata({
        userId: 'user-1',
        companyId: 'company-1',
        fileId: 'file-1',
        isCompanyAdmin: false,
        userGroupIds: [],
      });
      expect(result).toBeNull();
    });

    it('uses OR logic across multiple rules (highest permission wins)', async () => {
      mockRuleCount.mockResolvedValue(2);
      mockRules.mockResolvedValue([
        {
          id: 'rule-1',
          permission_type: 'read',
          conditions: [{ key_id: 'key-type', value: 'report' }],
          assignments: [{ user_id: 'user-1', group_id: null }],
        },
        {
          id: 'rule-2',
          permission_type: 'write',
          conditions: [{ key_id: 'key-dept', value: 'finance' }],
          assignments: [{ user_id: 'user-1', group_id: null }],
        },
      ]);
      mockMetadataValues.mockResolvedValue([
        { metadata_id: 'key-dept', value: 'finance' },
      ]);

      const result = await canUserAccessFileByMetadata({
        userId: 'user-1',
        companyId: 'company-1',
        fileId: 'file-1',
        isCompanyAdmin: false,
        userGroupIds: [],
      });
      // rule-1 doesn't match (no type=report), rule-2 matches (dept=finance) → write
      expect(result).toBe('write');
    });

    it('rule with empty conditions matches all files', async () => {
      mockRuleCount.mockResolvedValue(1);
      mockRules.mockResolvedValue([
        {
          id: 'rule-1',
          permission_type: 'read',
          conditions: [],
          assignments: [{ user_id: 'user-1', group_id: null }],
        },
      ]);
      mockMetadataValues.mockResolvedValue([]);

      const result = await canUserAccessFileByMetadata({
        userId: 'user-1',
        companyId: 'company-1',
        fileId: 'file-1',
        isCompanyAdmin: false,
        userGroupIds: [],
      });
      expect(result).toBe('read');
    });

    it('returns null when rule is assigned to different user', async () => {
      // getUserRules filters by user/group, so for a different user it returns no rules
      mockRuleCount.mockResolvedValue(1);
      mockRules.mockResolvedValue([]);
      mockMetadataValues.mockResolvedValue([]);

      const result = await canUserAccessFileByMetadata({
        userId: 'user-1',
        companyId: 'company-1',
        fileId: 'file-1',
        isCompanyAdmin: false,
        userGroupIds: [],
      });
      expect(result).toBeNull();
    });
  });

  describe('getAccessibleFileIds', () => {
    it('returns all company files for company admin', async () => {
      mockFiles.mockResolvedValue([
        { id: 'file-1' },
        { id: 'file-2' },
      ]);
      mockMetadataValues.mockResolvedValue([]);

      const result = await getAccessibleFileIds({
        userId: 'user-1',
        companyId: 'company-1',
        isCompanyAdmin: true,
        userGroupIds: [],
      });
      expect(result).toEqual(['file-1', 'file-2']);
    });

    it('returns only files matching user permission rules', async () => {
      mockFiles.mockResolvedValue([
        { id: 'file-1' },
        { id: 'file-2' },
        { id: 'file-3' },
      ]);
      mockRuleCount.mockResolvedValue(1);
      mockRules.mockResolvedValue([
        {
          id: 'rule-1',
          permission_type: 'read',
          conditions: [{ key_id: 'key-type', value: 'invoice' }],
          assignments: [{ user_id: 'user-1', group_id: null }],
        },
      ]);
      // file-1 has invoice, file-2 has report, file-3 has invoice
      mockMetadataValues.mockResolvedValue([
        { files_id: 'file-1', metadata_id: 'key-type', value: 'invoice' },
        { files_id: 'file-2', metadata_id: 'key-type', value: 'report' },
        { files_id: 'file-3', metadata_id: 'key-type', value: 'invoice' },
      ]);

      const result = await getAccessibleFileIds({
        userId: 'user-1',
        companyId: 'company-1',
        isCompanyAdmin: false,
        userGroupIds: [],
      });
      expect(result).toEqual(['file-1', 'file-3']);
    });

    it('returns all files when no permission rules exist at all', async () => {
      mockFiles.mockResolvedValue([{ id: 'file-1' }]);
      mockMetadataValues.mockResolvedValue([]);
      mockRuleCount.mockResolvedValue(0);

      const result = await getAccessibleFileIds({
        userId: 'user-1',
        companyId: 'company-1',
        isCompanyAdmin: false,
        userGroupIds: [],
      });
      expect(result).toEqual(['file-1']);
    });

    it('returns empty array when rules exist but none assigned to user', async () => {
      mockFiles.mockResolvedValue([{ id: 'file-1' }]);
      mockMetadataValues.mockResolvedValue([]);
      mockRuleCount.mockResolvedValue(2);
      mockRules.mockResolvedValue([]);

      const result = await getAccessibleFileIds({
        userId: 'user-1',
        companyId: 'company-1',
        isCompanyAdmin: false,
        userGroupIds: [],
      });
      expect(result).toEqual([]);
    });

    it('applies metadata filters to narrow results', async () => {
      mockFiles.mockResolvedValue([
        { id: 'file-1' },
        { id: 'file-2' },
      ]);
      mockRuleCount.mockResolvedValue(1);
      mockRules.mockResolvedValue([
        {
          id: 'rule-1',
          permission_type: 'read',
          conditions: [],
          assignments: [{ user_id: 'user-1', group_id: null }],
        },
      ]);
      mockMetadataValues.mockResolvedValue([
        { files_id: 'file-1', metadata_id: 'key-type', value: 'invoice' },
        { files_id: 'file-2', metadata_id: 'key-type', value: 'report' },
      ]);

      const result = await getAccessibleFileIds({
        userId: 'user-1',
        companyId: 'company-1',
        isCompanyAdmin: false,
        userGroupIds: [],
        metadataFilters: [{ key_id: 'key-type', value: 'invoice' }],
      });
      expect(result).toEqual(['file-1']);
    });
  });

  describe('buildVirtualTree', () => {
    it('returns flat list when no key order specified', () => {
      const files = [
        { id: 'file-1', name: 'doc1.pdf' },
        { id: 'file-2', name: 'doc2.pdf' },
      ];
      const metadata: Record<string, Record<string, string[]>> = {};
      const keyOrder: Array<{ id: string; name: string }> = [];

      const tree = buildVirtualTree(files, metadata, keyOrder);
      expect(tree).toEqual([
        { id: 'file-1', name: 'doc1.pdf', type: 'file' },
        { id: 'file-2', name: 'doc2.pdf', type: 'file' },
      ]);
    });

    it('groups files by single metadata key', () => {
      const files = [
        { id: 'file-1', name: 'inv1.pdf' },
        { id: 'file-2', name: 'rep1.pdf' },
        { id: 'file-3', name: 'inv2.pdf' },
      ];
      const metadata: Record<string, Record<string, string[]>> = {
        'file-1': { 'key-type': ['invoice'] },
        'file-2': { 'key-type': ['report'] },
        'file-3': { 'key-type': ['invoice'] },
      };
      const keyOrder = [{ id: 'key-type', name: 'type' }];

      const tree = buildVirtualTree(files, metadata, keyOrder);
      expect(tree).toHaveLength(2); // invoice, report (no uncategorized since all files have metadata)
      const invoiceNode = tree.find((n: any) => n.name === 'invoice');
      expect(invoiceNode).toBeDefined();
      expect(invoiceNode!.children).toHaveLength(2);
      expect(invoiceNode!.keyName).toBe('type');
      const reportNode = tree.find((n: any) => n.name === 'report');
      expect(reportNode).toBeDefined();
      expect(reportNode!.children).toHaveLength(1);
    });

    it('handles nested grouping with multiple keys', () => {
      const files = [
        { id: 'file-1', name: 'inv1.pdf' },
        { id: 'file-2', name: 'inv2.pdf' },
      ];
      const metadata: Record<string, Record<string, string[]>> = {
        'file-1': { 'key-year': ['2025'], 'key-type': ['invoice'] },
        'file-2': { 'key-year': ['2026'], 'key-type': ['invoice'] },
      };
      const keyOrder = [
        { id: 'key-year', name: 'year' },
        { id: 'key-type', name: 'type' },
      ];

      const tree = buildVirtualTree(files, metadata, keyOrder);
      // Should have year nodes at top level
      const y2025 = tree.find((n: any) => n.name === '2025');
      const y2026 = tree.find((n: any) => n.name === '2026');
      expect(y2025).toBeDefined();
      expect(y2026).toBeDefined();
      // Each year node should have a type sub-node
      expect(y2025!.children![0].name).toBe('invoice');
      expect(y2025!.children![0].children).toHaveLength(1);
    });

    it('places files missing metadata values under Uncategorized', () => {
      const files = [
        { id: 'file-1', name: 'tagged.pdf' },
        { id: 'file-2', name: 'untagged.pdf' },
      ];
      const metadata: Record<string, Record<string, string[]>> = {
        'file-1': { 'key-type': ['invoice'] },
        // file-2 has no metadata for key-type
      };
      const keyOrder = [{ id: 'key-type', name: 'type' }];

      const tree = buildVirtualTree(files, metadata, keyOrder);
      const uncategorized = tree.find((n: any) => n.name === 'Uncategorized');
      expect(uncategorized).toBeDefined();
      expect(uncategorized!.isUncategorized).toBe(true);
      expect(uncategorized!.keyName).toBe('type');
      expect(uncategorized!.children).toHaveLength(1);
      expect(uncategorized!.children![0].name).toBe('untagged.pdf');
    });

    it('file with multiple values for same key appears under each value group', () => {
      const files = [
        { id: 'file-1', name: 'multi.pdf' },
      ];
      const metadata: Record<string, Record<string, string[]>> = {
        'file-1': { 'key-provider': ['test', 'ffdgdf'] },
      };
      const keyOrder = [{ id: 'key-provider', name: 'provider' }];

      const tree = buildVirtualTree(files, metadata, keyOrder);
      expect(tree).toHaveLength(2); // ffdgdf, test (sorted alphabetically)
      expect(tree[0].name).toBe('ffdgdf');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children![0].name).toBe('multi.pdf');
      expect(tree[1].name).toBe('test');
      expect(tree[1].children).toHaveLength(1);
      expect(tree[1].children![0].name).toBe('multi.pdf');
    });
  });
});
