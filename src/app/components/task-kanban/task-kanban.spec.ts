import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TaskKanbanComponent } from './task-kanban';

describe('TaskKanbanComponent', () => {
  let component: TaskKanbanComponent;
  let fixture: ComponentFixture<TaskKanbanComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskKanbanComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskKanbanComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
