import { useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAgents } from '../hooks/useAgents';
import { useProject } from '../hooks/useProjects';
import {
  useProjectAgents, useAddProjectAgent, useUpdateProjectAgent, useRemoveProjectAgent,
} from '../hooks/useProjectAgents';
import {
  generateBatScript, generateShScript, generateClaudeMd,
  downloadZip, saveFilesToDisk, hasFileSystemAccess,
} from '../lib/scriptGenerator';
import {
  Button, Input, TextArea, Select, Modal, FormField, Badge,
  EmptyState, Avatar, Section, IconButton, Divider,
} from '../components/ui';
import { cx } from '../lib/cx';
import type { ProjectAgent, LaunchConfig } from '../api/types';
import styles from './AgentManager.module.css';

export default function AgentManager() {
  const { slug } = useParams<{ slug: string }>();
  const { data: project } = useProject(slug);
  const { data: allAgents } = useAgents();
  const { data: projectAgents, isLoading } = useProjectAgents(slug);
  const addAgent = useAddProjectAgent(slug);
  const updatePA = useUpdateProjectAgent(slug);
  const removeAgent = useRemoveProjectAgent(slug);

  // Add agent modal
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');

  // Expanded config
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editTask, setEditTask] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editTools, setEditTools] = useState('');
  const [editPromptSource, setEditPromptSource] = useState('append');
  const [editSkipPerms, setEditSkipPerms] = useState(false);

  // Launch state
  const [workingDir, setWorkingDir] = useState('');
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:8321');
  const [wdInitialized, setWdInitialized] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTab, setPreviewTab] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  if (project && !wdInitialized) {
    setWorkingDir(project.working_dir ?? '');
    setWdInitialized(true);
  }

  const addedNames = new Set(projectAgents?.map((pa) => pa.agent_name) ?? []);
  const availableAgents = allAgents?.filter((a) => !addedNames.has(a.name)) ?? [];
  const hasAgents = projectAgents && projectAgents.length > 0;

  // ─── Handlers ───
  const openExpand = (pa: ProjectAgent) => {
    setExpandedAgent(pa.agent_name);
    setEditPrompt(pa.system_prompt ?? '');
    setEditTask(pa.initial_task ?? '');
    setEditModel(pa.model ?? '');
    setEditTools(pa.allowed_tools ?? '');
    setEditPromptSource(pa.prompt_source);
    setEditSkipPerms(pa.skip_permissions);
  };

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!addName) return;
    addAgent.mutate(
      { agent_name: addName },
      { onSuccess: () => { setShowAdd(false); setAddName(''); } },
    );
  };

  const handleSaveConfig = (name: string) => {
    updatePA.mutate({
      agent_name: name,
      system_prompt: editPrompt || undefined,
      initial_task: editTask || undefined,
      model: editModel || undefined,
      allowed_tools: editTools || undefined,
      prompt_source: editPromptSource,
      skip_permissions: editSkipPerms,
    }, { onSuccess: () => setExpandedAgent(null) });
  };

  const handleRemove = (name: string) => {
    removeAgent.mutate(name, {
      onSuccess: () => { setConfirmRemove(null); if (expandedAgent === name) setExpandedAgent(null); },
    });
  };

  // ─── Launch helpers ───
  const buildConfigs = (): LaunchConfig[] =>
    (projectAgents ?? []).map((pa) => ({
      agentName: pa.agent_name, role: pa.agent_role ?? '',
      systemPrompt: pa.system_prompt ?? pa.agent_role ?? '',
      initialTask: pa.initial_task ?? '', workingDir, serverUrl,
      projectSlug: slug ?? '', model: pa.model ?? '',
      allowedTools: pa.allowed_tools ?? '',
      promptSource: pa.prompt_source as 'append' | 'override',
      skipPermissions: pa.skip_permissions,
    }));

  const buildFiles = () => {
    const configs = buildConfigs();
    if (!configs.length) return [];
    const files: { name: string; content: string }[] = [];
    for (const cfg of configs) {
      files.push({ name: `${cfg.agentName}.bat`, content: generateBatScript(cfg) });
      files.push({ name: `${cfg.agentName}.sh`, content: generateShScript(cfg) });
    }
    files.push({
      name: 'CLAUDE.md',
      content: generateClaudeMd(project?.name ?? slug ?? 'project', project?.description ?? '', configs.map((c) => ({ name: c.agentName, role: c.role }))),
    });
    return files;
  };

  const handleDownloadZip = () => {
    const files = buildFiles();
    if (files.length) downloadZip(`${slug ?? 'agents'}-launch.zip`, files);
  };

  const handleSaveToDisk = async () => {
    const files = buildFiles();
    if (!files.length) return;
    setSaveStatus('Choosing directory...');
    try {
      const count = await saveFilesToDisk(files);
      if (count === null) setSaveStatus(null);
      else { setSaveStatus(`Saved ${count} files`); setTimeout(() => setSaveStatus(null), 3000); }
    } catch (err) { setSaveStatus(`Error: ${(err as Error).message}`); setTimeout(() => setSaveStatus(null), 4000); }
  };

  if (isLoading) return <EmptyState message="Loading agents..." />;

  return (
    <div className={styles.page}>
      {/* ═══ Project Agents ═══ */}
      {!hasAgents ? (
        <EmptyState
          icon="🤖"
          message="No agents assigned to this project."
          action={
            <div className={styles.emptyActions}>
              <Button onClick={() => setShowAdd(true)}>Add Agent</Button>
              <Link to="/agents" className={styles.registryLink}>
                or manage the registry
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <div className={styles.listHeader}>
            <span className={styles.listCount}>{projectAgents.length} agent{projectAgents.length !== 1 ? 's' : ''}</span>
            <div className={styles.listActions}>
              <Link to="/agents" className={styles.registryLink}>Registry</Link>
              <Button size="sm" onClick={() => setShowAdd(true)}>+ Add Agent</Button>
            </div>
          </div>

          {projectAgents.map((pa) => {
            const isExpanded = expandedAgent === pa.agent_name;
            return (
              <div key={pa.agent_name} className={styles.agentCard}>
                <div
                  className={styles.agentCardHeader}
                  onClick={() => isExpanded ? setExpandedAgent(null) : openExpand(pa)}
                >
                  <span className={cx(styles.expandIcon, isExpanded && styles.expandIconOpen)}>&#9654;</span>
                  <Avatar name={pa.agent_name} size="sm" />
                  <span className={styles.agentName}>{pa.agent_name}</span>
                  <span className={styles.agentMeta}>
                    {pa.agent_display_name && <>{pa.agent_display_name} &middot; </>}
                    {pa.agent_role ?? 'No role'}
                    {pa.model && <> &middot; <Badge variant="subtle">{pa.model}</Badge></>}
                    {pa.skip_permissions && <> &middot; <Badge color="var(--accent-red)" variant="subtle">skip-perms</Badge></>}
                  </span>
                  <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                    {confirmRemove === pa.agent_name ? (
                      <>
                        <Button size="sm" variant="danger" onClick={() => handleRemove(pa.agent_name)} loading={removeAgent.isPending}>
                          Confirm
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>Cancel</Button>
                      </>
                    ) : (
                      <IconButton icon="×" variant="danger" onClick={() => setConfirmRemove(pa.agent_name)} tooltip="Remove" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className={styles.configPanel}>
                    <FormField label="System Prompt">
                      <TextArea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} placeholder="System prompt..." rows={4} />
                    </FormField>
                    <FormField label="Initial Task">
                      <TextArea value={editTask} onChange={(e) => setEditTask(e.target.value)} placeholder="Initial task..." rows={3} />
                    </FormField>
                    <div className={styles.configGrid3}>
                      <FormField label="Model">
                        <Input value={editModel} onChange={(e) => setEditModel(e.target.value)} placeholder="e.g. claude-sonnet-4-6" />
                      </FormField>
                      <FormField label="Prompt Mode">
                        <Select value={editPromptSource} onChange={(e) => setEditPromptSource(e.target.value)} options={[
                          { value: 'append', label: 'Append' },
                          { value: 'override', label: 'Override' },
                        ]} />
                      </FormField>
                      <FormField label="Permissions">
                        <div className={styles.checkRow}>
                          <input type="checkbox" checked={editSkipPerms} onChange={(e) => setEditSkipPerms(e.target.checked)} />
                          <span style={{ color: editSkipPerms ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                            Skip permissions
                          </span>
                        </div>
                      </FormField>
                    </div>
                    <FormField label="Allowed Tools" hint="Comma-separated">
                      <Input value={editTools} onChange={(e) => setEditTools(e.target.value)} placeholder="Bash,Read,Write,Edit,Glob,Grep" />
                    </FormField>
                    <div className={styles.configActions}>
                      <Button variant="secondary" onClick={() => setExpandedAgent(null)}>Cancel</Button>
                      <Button onClick={() => handleSaveConfig(pa.agent_name)} loading={updatePA.isPending}>Save Config</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* ═══ Launch Scripts (inline section, only when agents exist) ═══ */}
          <Divider />

          <Section title="Launch Scripts" description="Generate launch scripts for all project agents.">
            <div className={styles.launchGrid}>
              <FormField label="Working Directory">
                <Input value={workingDir} onChange={(e) => setWorkingDir(e.target.value)} placeholder="/path/to/project" />
              </FormField>
              <FormField label="Server URL">
                <Input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="http://127.0.0.1:8321" />
              </FormField>
            </div>

            <div className={styles.launchActions}>
              {hasFileSystemAccess() && (
                <Button onClick={handleSaveToDisk} disabled={!hasAgents}>
                  Save to Disk ({projectAgents.length} agents)
                </Button>
              )}
              <Button variant="secondary" onClick={handleDownloadZip} disabled={!hasAgents}>
                Download .zip ({projectAgents.length} agents)
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (!showPreview && projectAgents.length) setPreviewTab(projectAgents[0].agent_name);
                  setShowPreview(!showPreview);
                }}
                disabled={!hasAgents}
              >
                {showPreview ? 'Hide Preview' : 'Preview'}
              </Button>
              {saveStatus && (
                <span className={styles.saveStatus} style={{
                  color: saveStatus.startsWith('Error') ? 'var(--accent-red)' : 'var(--accent-green)',
                }}>
                  {saveStatus}
                </span>
              )}
            </div>

            {showPreview && hasAgents && (() => {
              const configs = buildConfigs();
              const claudeMd = generateClaudeMd(
                project?.name ?? slug ?? 'project', project?.description ?? '',
                configs.map((c) => ({ name: c.agentName, role: c.role })),
              );
              const tabs = [...projectAgents.map((pa) => pa.agent_name), 'CLAUDE.md'];
              const active = tabs.includes(previewTab) ? previewTab : tabs[0];
              let content = '';
              if (active === 'CLAUDE.md') {
                content = claudeMd;
              } else {
                const cfg = configs.find((c) => c.agentName === active);
                if (cfg) content = `=== ${active}.bat ===\n\n${generateBatScript(cfg)}\n\n=== ${active}.sh ===\n\n${generateShScript(cfg)}`;
              }
              return (
                <>
                  <div className={styles.previewTabs}>
                    {tabs.map((t) => (
                      <Button key={t} size="sm" variant={active === t ? 'primary' : 'secondary'} onClick={() => setPreviewTab(t)}>
                        {t}
                      </Button>
                    ))}
                  </div>
                  <pre className={styles.preBlock}>{content}</pre>
                </>
              );
            })()}
          </Section>
        </>
      )}

      {/* ═══ Add Agent Modal ═══ */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Agent to Project"
        description="Select an agent from the global registry."
        footer={
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!addName} loading={addAgent.isPending}>Add to Project</Button>
          </div>
        }
      >
        <form onSubmit={handleAdd} className={styles.formFields}>
          <FormField label="Agent">
            {availableAgents.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 12 }}>
                All agents already added or none exist.{' '}
                <Link to="/agents" style={{ color: 'var(--accent-blue)' }}>
                  Create one in the registry
                </Link>
              </div>
            ) : (
              <Select value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Select an agent..."
                options={availableAgents.map((a) => ({ value: a.name, label: `${a.name}${a.role ? ` — ${a.role}` : ''}` }))} />
            )}
          </FormField>
          {addAgent.error && <div className={styles.error}>{(addAgent.error as Error).message}</div>}
        </form>
      </Modal>
    </div>
  );
}
