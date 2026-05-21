import { Routes } from '@angular/router';

import { ProjectCalendarComponent } from './components/project-calendar/project-calendar.component';
import { ProjectListComponent } from './components/project-list/project-list.component';
import { ProjectsComponent } from './components/projects/projects.component';
import { ProjectRegisterComponent } from './components/project-register/project-register.component';
import { ProjectDetailComponent } from './components/project-detail/project-detail.component';
import { ProjectEditComponent } from './components/project-edit/project-edit.component';
import { LoginComponent } from './components/login/login.component';
import { TaskAddComponent } from './components/task-add/task-add';
import { TaskDetailComponent } from './components/task-detail/task-detail.component';
import { TaskEditComponent } from './components/task-edit/task-edit.component';
import { TasksComponent } from './components/tasks/tasks.component';
import { TaskListComponent } from './components/task-list/task-list.component';
import { TaskCalendarComponent } from './components/task-calendar/task-calendar';
import { TaskGanttComponent } from './components/task-gantt/task-gantt';
import { TaskKanbanComponent } from './components/task-kanban/task-kanban';
import { UsersDepartmentsComponent } from './components/users/users-departments/users-departments.component';
import { UsersRegisteredComponent } from './components/users/users-registered/users-registered.component';
import { SettingsComponent } from './components/settings/settings.component';
import { SettingsNotificationsComponent } from './components/settings/settings-notifications/settings-notifications.component';
import { SettingsProfileComponent } from './components/settings/settings-profile/settings-profile.component';
import { SettingsTrashComponent } from './components/settings/settings-trash/settings-trash.component';
import { SettingsIssueTypesComponent } from './components/settings/settings-issue-types/settings-issue-types.component';
import { SettingsTemplatesComponent } from './components/settings/settings-templates/settings-templates.component';
import { SettingsAuditHistoryComponent } from './components/settings/settings-audit-history/settings-audit-history.component';
import { UsersComponent } from './components/users/users.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { MyDashboardComponent } from './components/dashboard/my-dashboard/my-dashboard.component';
import { OrgDashboardComponent } from './components/dashboard/org-dashboard/org-dashboard.component';
import { ProjectDashboardComponent } from './components/dashboard/project-dashboard/project-dashboard.component';
import { authGuard } from './guards/auth.guard';
import { permissionGuard } from './guards/permission.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'my' },
      {
        path: 'my',
        component: MyDashboardComponent,
        canActivate: [permissionGuard],
        data: { permission: 'dashboard.my' },
      },
      {
        path: 'org',
        component: OrgDashboardComponent,
        canActivate: [permissionGuard],
        data: { permission: 'dashboard.org' },
      },
    ],
  },
  {
    path: 'projects',
    component: ProjectsComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'list' },
      {
        path: 'list',
        component: ProjectListComponent,
        canActivate: [permissionGuard],
        data: { permission: 'list.projects' },
      },
      {
        path: 'calendar',
        component: ProjectCalendarComponent,
        canActivate: [permissionGuard],
        data: { permission: 'list.projects' },
      },
      {
        path: 'register',
        component: ProjectRegisterComponent,
        canActivate: [permissionGuard],
        data: { permission: 'project.manage' },
      },
      {
        path: ':managementNumber/edit',
        component: ProjectEditComponent,
        canActivate: [permissionGuard],
        data: { permission: 'project.manage' },
      },
      {
        path: ':managementNumber/dashboard',
        component: ProjectDashboardComponent,
        canActivate: [permissionGuard],
        data: { permission: 'dashboard.project' },
      },
      {
        path: ':managementNumber',
        component: ProjectDetailComponent,
        canActivate: [permissionGuard],
        data: { permission: 'project.detail.view' },
      },
    ],
  },
  {
    path: 'tasks',
    component: TasksComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'list' },
      {
        path: 'add',
        component: TaskAddComponent,
        canActivate: [permissionGuard],
        data: { permission: 'task.write' },
      },
      {
        path: 'calendar',
        component: TaskCalendarComponent,
        canActivate: [permissionGuard],
        data: { permission: 'list.tasks' },
      },
      {
        path: 'gantt',
        component: TaskGanttComponent,
        canActivate: [permissionGuard],
        data: { permission: 'list.tasks' },
      },
      {
        path: 'kanban',
        component: TaskKanbanComponent,
        canActivate: [permissionGuard],
        data: { permission: 'list.tasks' },
      },
      {
        path: 'list',
        component: TaskListComponent,
        canActivate: [permissionGuard],
        data: { permission: 'list.tasks' },
      },
      {
        path: ':managementNo/edit',
        component: TaskEditComponent,
        canActivate: [permissionGuard],
        data: { permission: 'task.write' },
      },
      {
        path: ':managementNo',
        component: TaskDetailComponent,
        canActivate: [permissionGuard],
        data: { permission: 'project.detail.view' },
      },
    ],
  },
  {
    path: 'settings',
    component: SettingsComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      {
        path: 'profile',
        component: SettingsProfileComponent,
        canActivate: [permissionGuard],
        data: { permission: 'settings.profile' },
      },
      {
        path: 'notifications',
        component: SettingsNotificationsComponent,
        canActivate: [permissionGuard],
        data: { permission: 'settings.notifications', pageTitle: '通知設定' },
      },
      {
        path: 'templates',
        component: SettingsTemplatesComponent,
        canActivate: [permissionGuard],
        data: { permission: 'settings.templates' },
      },
      {
        path: 'issue-types',
        component: SettingsIssueTypesComponent,
        canActivate: [permissionGuard],
        data: { permission: 'settings.issueTypes' },
      },
      {
        path: 'users',
        component: UsersComponent,
        canActivate: [permissionGuard],
        data: { permission: 'settings.users' },
      },
      {
        path: 'audit-history',
        component: SettingsAuditHistoryComponent,
        canActivate: [permissionGuard],
        data: { permission: 'settings.auditHistory' },
      },
      {
        path: 'archive-trash',
        component: SettingsTrashComponent,
        canActivate: [permissionGuard],
        data: { permissionsAny: ['archive.restore', 'trash.manage'] },
      },
      { path: 'trash', redirectTo: 'archive-trash', pathMatch: 'full' },
      {
        path: 'users/departments',
        component: UsersDepartmentsComponent,
        canActivate: [permissionGuard],
        data: { permission: 'settings.users' },
      },
      {
        path: 'users/register',
        component: UsersRegisteredComponent,
        canActivate: [permissionGuard],
        data: { permission: 'settings.users' },
      },
      {
        path: 'users/edit/:email',
        component: UsersRegisteredComponent,
        canActivate: [permissionGuard],
        data: { permission: 'settings.users' },
      },
    ],
  },
];
