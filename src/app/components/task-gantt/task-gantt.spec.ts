import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TaskGanttComponent } from './task-gantt';

describe('TaskGanttComponent', () => {
  let component: TaskGanttComponent;
  let fixture: ComponentFixture<TaskGanttComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskGanttComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskGanttComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
